import {
  isAutomationsApiEnabled,
  isAutomationsManualRunEnabled,
  isAutomationWorkflowEnabled,
  isAutomationWorkflowPausedByConfig,
} from '@/lib/automations/config';
import { listAutomationWorkflowContracts } from '@/lib/automations/contracts';
import { getAutomationWorkflowCredentials } from '@/lib/automations/credentials';
import { resolveN8nClientConfig } from '@/lib/automations/n8n-client';
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
  type AutomationWorkflowKey,
} from '@/types/automations';

export type AutomationUiStatus = 'disabled' | 'ready' | 'degraded' | 'misconfigured' | 'paused';
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
  const orchestratorConfig = resolveN8nClientConfig(env);
  const store =
    input.store === undefined
      ? storeConfig.ok
        ? buildAutomationStateStore(env)
        : null
      : input.store;
  const systemEnabled = isAutomationsApiEnabled(env);
  const credentials = getAutomationWorkflowCredentials(env);
  let storedRuns: Awaited<ReturnType<AutomationStateStore['listRuns']>> = [];
  if (store) {
    try {
      storedRuns = await store.listRuns({ limit: 20 });
    } catch {
      storedRuns = [];
    }
  }
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
      const control = store
        ? await store.getWorkflowControl(contract.workflowKey).catch(() => null)
        : null;
      const lastRun = recentRuns.find((run) => run.workflowKey === contract.workflowKey) ?? null;
      const workflowEnabled = isAutomationWorkflowEnabled(contract.workflowKey, env);
      const hasCredentials =
        credentials.ok &&
        contract.principalKeys.every((principalKey) =>
          credentials.credentials.some((item) => item.workflowPrincipalKey === principalKey),
        );
      const paused =
        isAutomationWorkflowPausedByConfig(contract.workflowKey, env) ||
        control?.paused === true ||
        control?.circuit.mode === 'open';
      let status: AutomationUiStatus = 'ready';
      if (!systemEnabled || !workflowEnabled) status = 'disabled';
      else if (!storeConfig.ok || !orchestratorConfig.ok || !hasCredentials)
        status = 'misconfigured';
      else if (paused) status = 'paused';
      else if ((control?.circuit.consecutiveFailures ?? 0) > 0) status = 'degraded';
      return {
        workflowKey: contract.workflowKey,
        name: contract.name,
        description: DESCRIPTIONS[contract.workflowKey],
        principals: contract.principalKeys.map((key) => PRINCIPAL_LABELS[key]).join(' / '),
        status,
        schedule: SCHEDULE_LABELS[contract.workflowKey],
        nextRun: workflowEnabled ? nextAutomationRun(contract.workflowKey, input.nowMs) : null,
        lastRun,
        paused,
        circuit: control?.circuit.mode ?? 'closed',
        canRunNow:
          status === 'ready' &&
          isAutomationsManualRunEnabled(env) &&
          contract.principalKeys.length === 1,
      };
    }),
  );
  return {
    contractVersion: AUTOMATION_CONTRACT_VERSION,
    orchestratorConfigured: orchestratorConfig.ok,
    storeConfigured: storeConfig.ok,
    systemEnabled,
    manualRunEnabled: isAutomationsManualRunEnabled(env),
    items,
    recentRuns,
  };
}
