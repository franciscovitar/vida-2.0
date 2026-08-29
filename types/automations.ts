/**
 * Contratos del Bloque 5 — automatizaciones controladas.
 * Los workflows nunca amplían permisos: su alcance efectivo es la intersección
 * entre el perfil canónico del agente y el contrato del principal de workflow.
 */
import type {
  OpenClawAgentId,
  OpenClawProposeOperation,
  OpenClawReadOperation,
} from '@/types/openclaw';

export const AUTOMATION_CONTRACT_VERSION = 'vida2-automations-v1' as const;
export type AutomationContractVersion = typeof AUTOMATION_CONTRACT_VERSION;

export const AUTOMATION_WORKFLOW_KEYS = Object.freeze([
  'daily-briefing',
  'technical-watchdog',
  'weekly-review',
  'approval-digest',
  'planning-suggestion',
] as const);

export type AutomationWorkflowKey = (typeof AUTOMATION_WORKFLOW_KEYS)[number];

export const AUTOMATION_PRINCIPAL_KEYS = Object.freeze([
  'daily-briefing',
  'technical-watchdog',
  'weekly-review',
  'approval-digest-steward',
  'approval-digest-health',
  'planning-suggestion',
] as const);

export type AutomationPrincipalKey = (typeof AUTOMATION_PRINCIPAL_KEYS)[number];
export type AutomationPrincipalId = `workflow:${AutomationPrincipalKey}`;

export type AutomationOutputKind = 'briefing' | 'alert' | 'review' | 'digest' | 'proposal';

export const AUTOMATION_RUN_STATUSES = Object.freeze([
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
] as const);
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const AUTOMATION_TRIGGERS = Object.freeze(['scheduled', 'manual', 'retry'] as const);
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_RESULT_CODES = Object.freeze([
  'accepted',
  'completed',
  'no-change',
  'proposal-created',
  'dispatch-failed',
  'timed-out',
  'invalid-result',
  'cancelled',
] as const);
export type AutomationResultCode = (typeof AUTOMATION_RESULT_CODES)[number];

export type AutomationArtifactItem = {
  label: string;
  value: string;
};

export type AutomationArtifact = {
  artifactKey: string;
  runKey: string;
  workflowKey: AutomationWorkflowKey;
  principalKey: AutomationPrincipalKey;
  kind: AutomationOutputKind;
  title: string;
  summary: string;
  items: readonly AutomationArtifactItem[];
  proposalKey: string | null;
  createdAt: string;
  expiresAt: string;
};

/** Registro deliberadamente sanitizado: nunca contiene requests, firmas ni IDs de proveedor. */
export type AutomationRunRecord = {
  runKey: string;
  workflowKey: AutomationWorkflowKey;
  principalKey: AutomationPrincipalKey;
  principalId: AutomationPrincipalId;
  trigger: AutomationTrigger;
  status: AutomationRunStatus;
  attempt: number;
  idempotencyKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  resultCode: AutomationResultCode | null;
  summary: string | null;
  proposalKey: string | null;
  artifactKey: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type AutomationCircuitState = {
  mode: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  openedAt: string | null;
};

export type AutomationWorkflowControl = {
  workflowKey: AutomationWorkflowKey;
  paused: boolean;
  circuit: AutomationCircuitState;
  updatedAt: string;
};

export type AutomationScheduleContract = {
  cron: string;
  timezone: 'America/Argentina/Cordoba';
};

export type AutomationRetryContract = {
  maxAttempts: 3;
  backoffSeconds: readonly [5, 20];
  retryableStatusCodes: readonly [429, 500, 502, 503, 504];
};

export type AutomationWorkflowContract = {
  workflowKey: AutomationWorkflowKey;
  version: AutomationContractVersion;
  name: string;
  principalKeys: readonly AutomationPrincipalKey[];
  allowedReads: readonly OpenClawReadOperation[];
  allowedProposals: readonly OpenClawProposeOperation[];
  outputKind: AutomationOutputKind;
  schedule: AutomationScheduleContract;
  retry: AutomationRetryContract;
  ratePerMinute: number;
  maxConcurrency: 1;
  timeoutMs: number;
  retentionSeconds: number;
  prohibitedData: readonly string[];
};

export type AutomationPrincipalContract = {
  principalKey: AutomationPrincipalKey;
  principalId: AutomationPrincipalId;
  workflowKey: AutomationWorkflowKey;
  agentId: OpenClawAgentId;
  credentialKeyEnv: string;
  credentialSecretEnv: string;
};

export type AutomationCredentialResolution =
  | {
      ok: true;
      credentials: readonly {
        agentId: OpenClawAgentId;
        keyId: string;
        secret: string;
        principalId: AutomationPrincipalId;
        workflowPrincipalKey: AutomationPrincipalKey;
        workflowKey: AutomationWorkflowKey;
      }[];
    }
  | {
      ok: false;
      reason: 'incomplete-credentials' | 'duplicate-key-id';
    };
