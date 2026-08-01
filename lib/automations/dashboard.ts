import { listAutomationWorkflowContracts } from '@/lib/automations/contracts';
import {
  evaluateAutomationReadiness,
  type AutomationReadinessCheck,
  type AutomationReadinessState,
} from '@/lib/automations/readiness';
import {
  buildAutomationStateStore,
  resolveAutomationStoreConfig,
  type AutomationStateStore,
} from '@/lib/automations/store';
import {
  AUTOMATION_CONTRACT_VERSION,
  type AutomationResultCode,
  type AutomationRunStatus,
  type AutomationTrigger,
  type AutomationWorkflowControl,
  type AutomationWorkflowKey,
} from '@/types/automations';

export type AutomationUiStatus = AutomationReadinessState;
export type AutomationDashboardRun = {
  workflowKey: AutomationWorkflowKey;
  trigger: AutomationTrigger;
  status: AutomationRunStatus;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  resultCode: AutomationResultCode | null;
  summary: string | null;
  proposalCreated: boolean;
  createdAt: string;
};
export type AutomationDashboardItem = {
  workflowKey: AutomationWorkflowKey;
  name: string;
  description: string;
  principals: string;
  status: AutomationUiStatus;
  schedule: string;
  nextRun: string | null;
  lastRun: AutomationDashboardRun | null;
  paused: boolean;
  circuit: 'closed' | 'open' | 'half-open';
  canRunNow: boolean;
};
export type AutomationDashboardData = {
  contractVersion: typeof AUTOMATION_CONTRACT_VERSION;
  orchestratorConfigured: boolean;
  storeConfigured: boolean;
  systemEnabled: boolean;
  manualRunEnabled: boolean;
  callbackEnabled: boolean;
  templatesProvisioned: boolean;
  credentialsConfigured: number;
  readinessState: AutomationReadinessState;
  readinessChecks: readonly AutomationReadinessCheck[];
  items: readonly AutomationDashboardItem[];
  recentRuns: readonly AutomationDashboardRun[];
};

const DESCRIPTIONS: Record<AutomationWorkflowKey, string> = {
  'daily-briefing':
    'Resume tareas, proyectos, agenda y propuestas dentro del alcance del Mayordomo.',
  'technical-watchdog':
    'Revisa estado y diagnósticos técnicos sanitizados, sin acciones correctivas.',
  'weekly-review': 'Prepara una revisión semanal por áreas con información de solo lectura.',
  'approval-digest': 'Agrupa propuestas pendientes sin aprobar, rechazar ni ejecutar ninguna.',
  'planning-suggestion':
    'Puede crear una propuesta de tarea; la decisión continúa exclusivamente en la Web.',
};

const PRINCIPAL_LABELS: Record<string, string> = {
  'daily-briefing': 'Mayordomo',
  'technical-watchdog': 'Guardián técnico',
  'weekly-review': 'Mayordomo',
  'approval-digest-steward': 'Mayordomo',
  'approval-digest-health': 'Salud y reflexión',
  'planning-suggestion': 'Mayordomo',
};

const SCHEDULE_LABELS: Record<AutomationWorkflowKey, string> = {
  'daily-briefing': 'Todos los días · 07:15',
  'technical-watchdog': 'Cada hora · minuto 17',
  'weekly-review': 'Domingos · 18:10',
  'approval-digest': 'Todos los días · 12:15 y 19:15',
  'planning-suggestion': 'Lunes a viernes · 07:30',
};

/** Próximo horario informativo. Córdoba mantiene UTC-3 durante todo el año. */
export function nextAutomationRun(
  workflowKey: AutomationWorkflowKey,
  fromMs: number = Date.now(),
): string | null {
  const now = new Date(fromMs - 3 * 60 * 60 * 1000);
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const base = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset),
    );
    const weekday = base.getUTCDay();
    const times =
      workflowKey === 'approval-digest'
        ? [
            [12, 15],
            [19, 15],
          ]
        : workflowKey === 'technical-watchdog'
          ? Array.from({ length: 24 }, (_, hour) => [hour, 17])
          : workflowKey === 'weekly-review'
            ? [[18, 10]]
            : workflowKey === 'planning-suggestion'
              ? [[7, 30]]
              : [[7, 15]];
    if (workflowKey === 'weekly-review' && weekday !== 0) continue;
    if (workflowKey === 'planning-suggestion' && (weekday === 0 || weekday === 6)) continue;
    for (const [hour, minute] of times)
      candidates.push(
        new Date(
          Date.UTC(
            base.getUTCFullYear(),
            base.getUTCMonth(),
            base.getUTCDate(),
            hour! + 3,
            minute!,
          ),
        ),
      );
  }
  return (
    candidates
      .filter((candidate) => candidate.getTime() > fromMs)
      .sort((a, b) => a.getTime() - b.getTime())[0]
      ?.toISOString() ?? null
  );
}

export async function getAutomationsDashboardData(
  input: {
    env?: Readonly<Record<string, string | undefined>>;
    store?: AutomationStateStore | null;
    nowMs?: number;
  } = {},
): Promise<AutomationDashboardData> {
  const env = input.env ?? process.env;
  const storeConfig = resolveAutomationStoreConfig(env);
  const store =
    input.store === undefined
      ? storeConfig.ok
        ? buildAutomationStateStore(env)
        : null
      : input.store;
  let storedRuns: Awaited<ReturnType<AutomationStateStore['listRuns']>> = [];
  const controls: Partial<Record<AutomationWorkflowKey, AutomationWorkflowControl | null>> = {};
  let storeReachable: boolean | null = storeConfig.ok ? null : false;
  if (store) {
    try {
      const [runs] = await Promise.all([
        store.listRuns({ limit: 20 }),
        ...listAutomationWorkflowContracts().map(async (contract) => {
          controls[contract.workflowKey] = await store.getWorkflowControl(contract.workflowKey);
        }),
      ]);
      storedRuns = runs;
      storeReachable = true;
    } catch {
      storedRuns = [];
      storeReachable = false;
    }
  }
  const readiness = evaluateAutomationReadiness({ env, controls, storeReachable });
  const readinessCheck = (id: AutomationReadinessCheck['id']): boolean =>
    readiness.checks.find((item) => item.id === id)?.ready ?? false;
  const recentRuns: readonly AutomationDashboardRun[] = storedRuns.map((run) => ({
    workflowKey: run.workflowKey,
    trigger: run.trigger,
    status: run.status,
    attempt: run.attempt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    resultCode: run.resultCode,
    summary: run.summary,
    proposalCreated: run.proposalKey !== null,
    createdAt: run.createdAt,
  }));
  const items = await Promise.all(
    listAutomationWorkflowContracts().map(async (contract): Promise<AutomationDashboardItem> => {
      const control = controls[contract.workflowKey] ?? null;
      const lastRun = recentRuns.find((run) => run.workflowKey === contract.workflowKey) ?? null;
      const workflowReadiness = readiness.workflows.find(
        (workflow) => workflow.workflowKey === contract.workflowKey,
      )!;
      const status = workflowReadiness.state;
      return {
        workflowKey: contract.workflowKey,
        name: contract.name,
        description: DESCRIPTIONS[contract.workflowKey],
        principals: contract.principalKeys.map((key) => PRINCIPAL_LABELS[key]).join(' / '),
        status,
        schedule: SCHEDULE_LABELS[contract.workflowKey],
        nextRun: workflowReadiness.enabled
          ? nextAutomationRun(contract.workflowKey, input.nowMs)
          : null,
        lastRun,
        paused: workflowReadiness.paused,
        circuit: control?.circuit.mode ?? 'closed',
        canRunNow:
          status === 'ready' && readinessCheck('manual') && contract.principalKeys.length === 1,
      };
    }),
  );
  return {
    contractVersion: AUTOMATION_CONTRACT_VERSION,
    orchestratorConfigured: readinessCheck('orchestrator'),
    storeConfigured: readinessCheck('store'),
    systemEnabled: readinessCheck('api'),
    manualRunEnabled: readinessCheck('manual'),
    callbackEnabled: readinessCheck('callback'),
    templatesProvisioned: readiness.templatesProvisioned,
    credentialsConfigured: readiness.credentialsConfigured,
    readinessState: readiness.state,
    readinessChecks: readiness.checks,
    items,
    recentRuns,
  };
}
