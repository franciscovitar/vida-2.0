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
