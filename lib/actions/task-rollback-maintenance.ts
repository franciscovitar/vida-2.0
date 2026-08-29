/**
 * Vía de mantenimiento focal y fail-closed para reparar el único rollback legacy
 * inconsistente de `task.create`.
 *
 * Contexto: antes de la corrección de `archiveOwnedTask`, el rollback de
 * `task.create` cambiaba el Estado de la tarea a «Algún día» en lugar de archivar
 * la página. Con Safe Writes OFF, `buildWriteRuntime()` devuelve puertos cerrados
 * y `runWriteAction` rechaza toda escritura, así que no existe forma soportada de
 * cerrar esa inconsistencia sin reactivar la flag. Este módulo la provee sin
 * abrir una API genérica de archive ni aceptar identificadores de recurso desde
 * el cliente.
 *
 * Invariantes:
 * - solo opera con `WRITE_ACTIONS_ENABLED=false`;
 * - target y ownership se derivan EXCLUSIVAMENTE del ledger, nunca del cliente;
 * - exige exactamente una candidata; con cero → no-op; con más de una → review;
 * - solo repara una tarea todavía activa cuyo Estado sea exactamente «Algún día»;
 * - la postcondición `getTask() === null` es obligatoria;
 * - no toca el ledger histórico, no cambia Estado, no crea propuestas ni acciones.
 */
import { isWriteActionsEnabled, getNotionTaskOwnershipProperty } from '@/lib/actions/config';
import { createNotionActionsClient } from '@/lib/actions/notion-client';
import { createNotionProposalRepository } from '@/lib/actions/notion-ledger';
import { createNotionTaskWritePort } from '@/lib/actions/notion-tasks';
import type { NotionTaskWritePort, ProposalRepositoryPort } from '@/lib/actions/ports';
import { getNotionConfig, getNotionDataSource } from '@/lib/notion/config';
import type { ActionProposalSummary } from '@/types/actions';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Huella concreta del bug histórico: la tarea sigue activa con este Estado exacto.
 * Cualquier otro Estado activo no es reparable automáticamente.
 */
const LEGACY_ROLLBACK_TASK_STATUS = 'Algún día';

/** Estado sanitizado. Nunca incluye IDs, targetKey, ownership, tokens ni data source IDs. */
export type LegacyTaskRollbackRepairState =
  'disabled' | 'none' | 'repairable' | 'requires-review' | 'misconfigured';

export type LegacyTaskRollbackRepairOutcome =
  'repaired' | 'already-consistent' | 'blocked' | 'archive-failed' | 'verification-failed';

export type LegacyTaskRollbackRepairResult = {
  ok: boolean;
  state: LegacyTaskRollbackRepairState;
  outcome: LegacyTaskRollbackRepairOutcome;
};

export type TaskRollbackMaintenanceDeps = {
  proposals: ProposalRepositoryPort;
  tasks: NotionTaskWritePort;
};

export type TaskRollbackMaintenanceDepsResult =
  | { ok: true; deps: TaskRollbackMaintenanceDeps }
  | { ok: false; state: 'disabled' | 'misconfigured' };

/** Propuesta que pasa TODOS los filtros a nivel ledger (todavía sin mirar la tarea real). */
function passesLedgerFilters(proposal: ActionProposalSummary): boolean {
  return (
    proposal.status === 'rolled-back' &&
    proposal.actionType === 'task.create' &&
    proposal.targetType === 'task' &&
    proposal.reversible === true &&
    typeof proposal.targetKey === 'string' &&
    proposal.targetKey.length > 0 &&
    typeof proposal.ownershipDigest === 'string' &&
    proposal.ownershipDigest.length > 0
  );
}

type Buckets = {
  /** Ledger coherente + tarea activa exactamente en «Algún día». */
  repairable: ActionProposalSummary[];
  /** Ledger coherente pero tarea activa en OTRO Estado: no auto-reparable. */
  review: ActionProposalSummary[];
};

async function classify(deps: TaskRollbackMaintenanceDeps): Promise<Buckets> {
  const rolledBack = await deps.proposals.list('rolled-back');
  const ledgerCandidates = rolledBack.filter(passesLedgerFilters);

  const buckets: Buckets = { repairable: [], review: [] };
  for (const proposal of ledgerCandidates) {
    // targetKey ya fue validado por passesLedgerFilters.
    const task = await deps.tasks.getTask(proposal.targetKey as string);
    if (task === null) {
      // Propuesta ya coherente (tarea archivada / ausente): no es candidata.
      continue;
    }
    if (task.status === LEGACY_ROLLBACK_TASK_STATUS) {
      buckets.repairable.push(proposal);
    } else {
      buckets.review.push(proposal);
    }
  }
  return buckets;
}

function stateFromBuckets(buckets: Buckets): LegacyTaskRollbackRepairState {
  if (buckets.repairable.length === 1 && buckets.review.length === 0) return 'repairable';
  if (buckets.repairable.length === 0 && buckets.review.length === 0) return 'none';
  // >1 reparable, o mezcla con casos que requieren mirada humana: nunca elegir.
  return 'requires-review';
}

/**
 * Detección de solo lectura para la UI. Fail-closed si Safe Writes está ON.
 * No muta nada. Devuelve únicamente el estado sanitizado.
 */
export async function inspectLegacyTaskRollbackRepair(
  deps: TaskRollbackMaintenanceDeps,
  env: Env = process.env,
): Promise<{ state: LegacyTaskRollbackRepairState }> {
  if (isWriteActionsEnabled(env)) return { state: 'disabled' };
  try {
    const buckets = await classify(deps);
    return { state: stateFromBuckets(buckets) };
  } catch {
    return { state: 'misconfigured' };
  }
}

/**
 * Repara exactamente la inconsistencia legacy. Re-ejecuta TODAS las verificaciones;
 * no confía en el resultado previo del inspector.
 */
export async function repairSingleLegacyTaskCreateRollback(
  deps: TaskRollbackMaintenanceDeps,
  env: Env = process.env,
): Promise<LegacyTaskRollbackRepairResult> {
  if (isWriteActionsEnabled(env)) {
    return { ok: false, state: 'disabled', outcome: 'blocked' };
  }

  let buckets: Buckets;
  try {
    buckets = await classify(deps);
  } catch {
    return { ok: false, state: 'misconfigured', outcome: 'blocked' };
  }

  const state = stateFromBuckets(buckets);

  if (state === 'none') {
    // Idempotente: al reabrir ya no hay tarea activa que reparar.
    return { ok: true, state: 'none', outcome: 'already-consistent' };
  }
  if (state !== 'repairable') {
    // requires-review / disabled: jamás mutar.
    return { ok: false, state, outcome: 'blocked' };
  }

  const proposal = buckets.repairable[0]!;
  // Derivado EXCLUSIVAMENTE del ledger.
  const targetKey = proposal.targetKey as string;
  const ownershipDigest = proposal.ownershipDigest as string;

  const archived = await deps.tasks.archiveOwnedTask(targetKey, ownershipDigest);
  if (!archived.ok) {
    return { ok: false, state: 'repairable', outcome: 'archive-failed' };
  }

  // Postcondición obligatoria: la tarea ya no debe estar activa.
  const after = await deps.tasks.getTask(targetKey);
  if (after !== null) {
    return { ok: false, state: 'repairable', outcome: 'verification-failed' };
  }

  return { ok: true, state: 'none', outcome: 'repaired' };
}

/**
 * Builder estrecho de dependencias de mantenimiento. Separado de
 * `buildWriteRuntime()`, cuya semántica NO cambia.
 *
 * - funciona con `WRITE_ACTIONS_ENABLED=false`;
 * - rechaza si `WRITE_ACTIONS_ENABLED=true`;
 * - exige Notion real y configuración válida; nunca cae en memoria;
 * - solo construye Notion TaskWritePort + ProposalRepositoryPort.
 */
export function buildTaskRollbackMaintenanceDeps(
  env: Env = process.env,
): TaskRollbackMaintenanceDepsResult {
  if (isWriteActionsEnabled(env)) {
    return { ok: false, state: 'disabled' };
  }
  if (getNotionDataSource(env) !== 'notion') {
    return { ok: false, state: 'misconfigured' };
  }
  const notion = getNotionConfig(env);
  if (!notion.ok) {
    return { ok: false, state: 'misconfigured' };
  }
  const actionsDataSourceId = env.NOTION_ACTIONS_DATA_SOURCE_ID?.trim();
  if (!actionsDataSourceId) {
    return { ok: false, state: 'misconfigured' };
  }

  const client = createNotionActionsClient(notion.config.token);
  const tasks = createNotionTaskWritePort({
    client,
    tasksDataSourceId: notion.config.tasksDataSourceId,
    projectsDataSourceId: notion.config.projectsDataSourceId,
    areasDataSourceId: notion.config.areasDataSourceId,
    ownershipProperty: getNotionTaskOwnershipProperty(env),
  });
  const proposals = createNotionProposalRepository({ client, actionsDataSourceId });

  return { ok: true, deps: { tasks, proposals } };
}
