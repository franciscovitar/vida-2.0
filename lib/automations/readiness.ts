import { validateEncryptionKey } from '@/lib/actions/encryption';
import {
  isAutomationWorkflowPausedByConfig,
  resolveAutomationsAccessMode,
} from '@/lib/automations/config';
import { listAutomationWorkflowContracts } from '@/lib/automations/contracts';
import { getAutomationWorkflowCredentials } from '@/lib/automations/credentials';
import { resolveN8nClientConfig } from '@/lib/automations/n8n-client';
import { resolveAutomationStoreConfig, type AutomationStateStore } from '@/lib/automations/store';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import {
  AUTOMATION_CONTRACT_VERSION,
  type AutomationWorkflowControl,
  type AutomationWorkflowKey,
} from '@/types/automations';

export type AutomationReadinessState =
  'disabled' | 'misconfigured' | 'degraded' | 'ready' | 'paused';

export type AutomationReadinessCheck = {
  id:
    | 'api'
    | 'access'
    | 'contract'
    | 'store'
    | 'encryption'
    | 'namespace'
    | 'orchestrator'
    | 'schedule-ingress'
    | 'callback'
    | 'manual'
    | 'credentials'
    | 'templates'
    | 'environment';
  ready: boolean;
  label: string;
};

export type AutomationWorkflowReadiness = {
  workflowKey: AutomationWorkflowKey;
  state: AutomationReadinessState;
  enabled: boolean;
  paused: boolean;
  circuit: AutomationWorkflowControl['circuit']['mode'];
};

export type AutomationReadiness = {
  state: AutomationReadinessState;
  contractVersion: typeof AUTOMATION_CONTRACT_VERSION;
  environment: 'local' | 'test' | 'preview' | 'production' | 'unknown';
  checks: readonly AutomationReadinessCheck[];
  credentialsConfigured: number;
  templatesProvisioned: boolean;
  storeReachable: boolean | null;
  workflows: readonly AutomationWorkflowReadiness[];
};

type ControlMap = Readonly<
  Partial<Record<AutomationWorkflowKey, AutomationWorkflowControl | null>>
>;

const WORKFLOW_FLAGS: Readonly<Record<AutomationWorkflowKey, string>> = Object.freeze({
  'daily-briefing': 'AUTOMATIONS_DAILY_BRIEFING_ENABLED',
  'technical-watchdog': 'AUTOMATIONS_TECHNICAL_WATCHDOG_ENABLED',
  'weekly-review': 'AUTOMATIONS_WEEKLY_REVIEW_ENABLED',
  'approval-digest': 'AUTOMATIONS_APPROVAL_DIGEST_ENABLED',
  'planning-suggestion': 'AUTOMATIONS_PLANNING_SUGGESTION_ENABLED',
});

function environmentOf(
  env: Readonly<Record<string, string | undefined>>,
): AutomationReadiness['environment'] {
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  if (env.NODE_ENV === 'production') return 'production';
  if (env.NODE_ENV === 'test') return 'test';
  if (env.NODE_ENV === 'development') return 'local';
  return 'unknown';
}

function check(
  id: AutomationReadinessCheck['id'],
  ready: boolean,
  label: string,
): AutomationReadinessCheck {
  return { id, ready, label };
}

export function evaluateAutomationReadiness(
  input: {
    env?: Readonly<Record<string, string | undefined>>;
    controls?: ControlMap;
    storeReachable?: boolean | null;
  } = {},
): AutomationReadiness {
  const env = input.env ?? process.env;
  const controls = input.controls ?? {};
  const environment = environmentOf(env);
  const apiGate = env.AUTOMATIONS_API_ENABLED === 'true';
  const accessMode = resolveAutomationsAccessMode(env);
  const accessReady = accessMode !== 'disabled';
  const contractReady =
    env.AUTOMATIONS_WORKFLOW_CONTRACT_VERSION?.trim() === AUTOMATION_CONTRACT_VERSION;
  const store = resolveAutomationStoreConfig(env);
  const orchestrator = resolveN8nClientConfig(env);
  const callbackReady = env.AUTOMATIONS_RESULT_CALLBACK_ENABLED === 'true';
  const openClaw = getOpenClawReadiness(env);
  const scheduleIngressReady =
    env.AUTOMATIONS_SCHEDULE_INGRESS_ENABLED === 'true' &&
    openClaw.apiStatus === 'read-only' &&
    openClaw.securityControls === 'ready';
  const manualReady = env.AUTOMATIONS_MANUAL_RUN_ENABLED === 'true';
  const templatesProvisioned = env.AUTOMATIONS_N8N_TEMPLATES_PROVISIONED === 'true';
  const credentials = getAutomationWorkflowCredentials(env);
  const credentialsConfigured = credentials.ok ? credentials.credentials.length : 0;
  const credentialsReady = credentials.ok && credentialsConfigured === 6;
  const productionReady =
    environment !== 'production' || env.AUTOMATIONS_PRODUCTION_ENABLED === 'true';
  const environmentReady = environment !== 'unknown' && productionReady;
  const namespaceReady = store.ok && store.value.namespace.startsWith('vida2:automations:');
  const encryptionReady = validateEncryptionKey(env.AUTOMATIONS_STATE_ENCRYPTION_KEY) !== null;
  const storeReachable = input.storeReachable ?? null;

  const checks = Object.freeze([
    check('api', apiGate, apiGate ? 'API habilitada' : 'API desactivada'),
    check('access', accessReady, accessReady ? 'Modo de acceso válido' : 'Modo desactivado'),
    check('contract', contractReady, contractReady ? 'Contrato vigente' : 'Contrato inválido'),
    check('store', store.ok, store.ok ? 'Store dedicado configurado' : 'Store no configurado'),
    check(
      'encryption',
      encryptionReady,
      encryptionReady ? 'Cifrado configurado' : 'Cifrado no configurado',
    ),
    check(
      'namespace',
      namespaceReady,
      namespaceReady ? 'Namespace separado' : 'Namespace inválido',
    ),
    check(
      'orchestrator',
      orchestrator.ok,
      orchestrator.ok ? 'Orquestador configurado' : 'Orquestador no configurado',
    ),
    check(
      'callback',
      callbackReady,
      callbackReady ? 'Callback habilitado' : 'Callback desactivado',
    ),
    check(
      'schedule-ingress',
      scheduleIngressReady,
      scheduleIngressReady ? 'Ingreso programado habilitado' : 'Ingreso programado desactivado',
    ),
    check(
      'manual',
      manualReady,
      manualReady ? 'Ejecución manual habilitada' : 'Ejecución manual desactivada',
    ),
    check(
      'credentials',
      credentialsReady,
      credentialsReady ? 'Seis principales configurados' : 'Principales incompletos',
    ),
    check(
      'templates',
      templatesProvisioned,
      templatesProvisioned ? 'Seis unidades n8n provisionadas' : 'Seis unidades n8n pendientes',
    ),
    check(
      'environment',
      environmentReady,
      environmentReady ? 'Entorno autorizado' : 'Entorno no autorizado',
    ),
  ]);

  const fatalConfigurationReady = checks
    .filter((item) => item.id !== 'api')
    .every((item) => item.ready);

  const workflows = Object.freeze(
    listAutomationWorkflowContracts().map((contract): AutomationWorkflowReadiness => {
      const enabled = apiGate && env[WORKFLOW_FLAGS[contract.workflowKey]] === 'true';
      const control = controls[contract.workflowKey] ?? null;
      const paused =
        isAutomationWorkflowPausedByConfig(contract.workflowKey, env) ||
        control?.paused === true ||
        control?.circuit.mode === 'open';
      const circuit = control?.circuit.mode ?? 'closed';
      const principalsReady =
        credentials.ok &&
        contract.principalKeys.every((principalKey) =>
          credentials.credentials.some((item) => item.workflowPrincipalKey === principalKey),
        );
      let state: AutomationReadinessState = 'ready';
      if (!enabled) state = 'disabled';
      else if (
        !fatalConfigurationReady ||
        !principalsReady ||
        (contract.outputKind === 'proposal' && accessMode !== 'proposal-only')
      )
        state = 'misconfigured';
      else if (paused) state = 'paused';
      else if (
        storeReachable === false ||
        circuit === 'half-open' ||
        (control?.circuit.consecutiveFailures ?? 0) > 0
      )
        state = 'degraded';
      return { workflowKey: contract.workflowKey, state, enabled, paused, circuit };
    }),
  );

  const enabled = workflows.filter((workflow) => workflow.enabled);
  let state: AutomationReadinessState;
  if (!apiGate || enabled.length === 0) state = 'disabled';
  else if (
    !fatalConfigurationReady ||
    enabled.some((workflow) => workflow.state === 'misconfigured')
  )
    state = 'misconfigured';
  else if (enabled.every((workflow) => workflow.state === 'paused')) state = 'paused';
  else if (
    storeReachable === false ||
    enabled.some((workflow) => workflow.state === 'degraded' || workflow.state === 'paused')
  )
    state = 'degraded';
  else state = 'ready';

  return {
    state,
    contractVersion: AUTOMATION_CONTRACT_VERSION,
    environment,
    checks,
    credentialsConfigured,
    templatesProvisioned,
    storeReachable,
    workflows,
  };
}

export async function loadAutomationReadiness(
  input: {
    env?: Readonly<Record<string, string | undefined>>;
    store?: AutomationStateStore | null;
  } = {},
): Promise<AutomationReadiness> {
  const env = input.env ?? process.env;
  const configured = resolveAutomationStoreConfig(env);
  const store = input.store ?? null;
  if (!configured.ok || !store) return evaluateAutomationReadiness({ env });
  const controls: Partial<Record<AutomationWorkflowKey, AutomationWorkflowControl | null>> = {};
  try {
    await Promise.all(
      listAutomationWorkflowContracts().map(async (contract) => {
        controls[contract.workflowKey] = await store.getWorkflowControl(contract.workflowKey);
      }),
    );
    return evaluateAutomationReadiness({ env, controls, storeReachable: true });
  } catch {
    return evaluateAutomationReadiness({ env, controls, storeReachable: false });
  }
}
