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

type Classification =
  | { state: 'none' }
  | { state: 'requires-review' }
  | { state: 'repairable'; proposal: ActionProposalSummary };

/**
 * Clasificación fail-closed.
 *
 * Primero aplica TODOS los filtros de ledger. `getTask` solo se consulta cuando
 * hay EXACTAMENTE una proposal elegible: con más de una, `getTask` podría
 * devolver `null` por un fallo de lectura de Notion (no solo por tarea ausente) y
 * hacer parecer que existe una única candidata. Ante varias proposals que
 * cumplen el contrato de ledger se exige revisión, aunque alguna ya estuviera
 * archivada: es una vía one-off y se prefiere un falso bloqueo a una selección
 * ambigua. Nunca se elige una entre varias.
 */
async function classify(deps: TaskRollbackMaintenanceDeps): Promise<Classification> {
  const rolledBack = await deps.proposals.list('rolled-back');
  const ledgerCandidates = rolledBack.filter(passesLedgerFilters);

  if (ledgerCandidates.length === 0) return { state: 'none' };
  if (ledgerCandidates.length > 1) return { state: 'requires-review' };

  const proposal = ledgerCandidates[0]!;
  // targetKey ya fue validado por passesLedgerFilters.
  const task = await deps.tasks.getTask(proposal.targetKey as string);
  if (task === null) {
    // Propuesta ya coherente (tarea archivada / ausente).
    return { state: 'none' };
  }
  if (task.status === LEGACY_ROLLBACK_TASK_STATUS) {
    return { state: 'repairable', proposal };
  }
  // Tarea activa en otro Estado: no es la huella del bug, no auto-reparable.
  return { state: 'requires-review' };
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
    const classification = await classify(deps);
    return { state: classification.state };
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

  let classification: Classification;
  try {
    classification = await classify(deps);
  } catch {
    return { ok: false, state: 'misconfigured', outcome: 'blocked' };
  }

  if (classification.state === 'none') {
    // Idempotente: al reabrir ya no hay tarea activa que reparar.
    return { ok: true, state: 'none', outcome: 'already-consistent' };
  }
  if (classification.state !== 'repairable') {
    // requires-review: jamás mutar; nunca elegir entre varias.
    return { ok: false, state: classification.state, outcome: 'blocked' };
  }

  // Derivado EXCLUSIVAMENTE del ledger (la única proposal elegible).
  const targetKey = classification.proposal.targetKey as string;
  const ownershipDigest = classification.proposal.ownershipDigest as string;

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
