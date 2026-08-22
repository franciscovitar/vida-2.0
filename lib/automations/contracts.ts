/**
 * Contratos canónicos e inmutables del MVP de automatizaciones.
 */
import {
  getOpenClawAgentProfile,
  isOpenClawProposalAllowed,
  isOpenClawReadAllowed,
} from '@/lib/openclaw/agents';
import {
  AUTOMATION_CONTRACT_VERSION,
  AUTOMATION_PRINCIPAL_KEYS,
  AUTOMATION_WORKFLOW_KEYS,
  type AutomationPrincipalContract,
  type AutomationPrincipalKey,
  type AutomationWorkflowContract,
  type AutomationWorkflowKey,
} from '@/types/automations';
import type {
  OpenClawAgentId,
  OpenClawProposeOperation,
  OpenClawReadOperation,
} from '@/types/openclaw';

const PROHIBITED_DATA = Object.freeze([
  'gmail',
  'drive',
  'journaling',
  'messages',
  'purchases',
  'deletions',
  'provider-credentials',
  'raw-provider-logs',
  'plaintext-sensitive-data',
]);

const RETRY_CONTRACT = Object.freeze({
  maxAttempts: 3,
  backoffSeconds: Object.freeze([5, 20] as const),
  retryableStatusCodes: Object.freeze([429, 500, 502, 503, 504] as const),
});

function freezeWorkflow(contract: AutomationWorkflowContract): AutomationWorkflowContract {
  return Object.freeze({
    ...contract,
    principalKeys: Object.freeze([...contract.principalKeys]),
    allowedReads: Object.freeze([...contract.allowedReads]),
    allowedProposals: Object.freeze([...contract.allowedProposals]),
    prohibitedData: Object.freeze([...contract.prohibitedData]),
    schedule: Object.freeze({ ...contract.schedule }),
    retry: Object.freeze({
      ...contract.retry,
      backoffSeconds: Object.freeze([...contract.retry.backoffSeconds]) as readonly [5, 20],
      retryableStatusCodes: Object.freeze([...contract.retry.retryableStatusCodes]) as readonly [
        429,
        500,
        502,
        503,
        504,
      ],
    }),
  });
}

const WORKFLOWS = Object.freeze({
  'daily-briefing': freezeWorkflow({
    workflowKey: 'daily-briefing',
    version: AUTOMATION_CONTRACT_VERSION,
    name: 'Briefing diario del Mayordomo',
    principalKeys: ['daily-briefing'],
    allowedReads: [
      'system.overview',
      'tasks.list',
      'projects.list',
      'calendar.upcoming',
      'approvals.list',
    ],
    allowedProposals: [],
    outputKind: 'briefing',
    schedule: { cron: '15 7 * * *', timezone: 'America/Argentina/Cordoba' },
    retry: RETRY_CONTRACT,
    ratePerMinute: 12,
    maxConcurrency: 1,
    timeoutMs: 90_000,
    retentionSeconds: 48 * 60 * 60,
    prohibitedData: PROHIBITED_DATA,
  }),
  'technical-watchdog': freezeWorkflow({
    workflowKey: 'technical-watchdog',
    version: AUTOMATION_CONTRACT_VERSION,
    name: 'Guardián técnico periódico',
    principalKeys: ['technical-watchdog'],
    allowedReads: ['technical.status', 'technical.logs'],
    allowedProposals: [],
    outputKind: 'alert',
    schedule: { cron: '17 * * * *', timezone: 'America/Argentina/Cordoba' },
    retry: RETRY_CONTRACT,
    ratePerMinute: 8,
    maxConcurrency: 1,
    timeoutMs: 45_000,
    retentionSeconds: 14 * 24 * 60 * 60,
    prohibitedData: PROHIBITED_DATA,
  }),
  'weekly-review': freezeWorkflow({
    workflowKey: 'weekly-review',
    version: AUTOMATION_CONTRACT_VERSION,
    name: 'Revisión semanal por áreas',
    principalKeys: ['weekly-review'],
    allowedReads: ['areas.list', 'areas.get', 'tasks.list', 'projects.list', 'calendar.upcoming'],
    allowedProposals: [],
    outputKind: 'review',
    schedule: { cron: '10 18 * * 0', timezone: 'America/Argentina/Cordoba' },
    retry: RETRY_CONTRACT,
    ratePerMinute: 12,
    maxConcurrency: 1,
    timeoutMs: 120_000,
    retentionSeconds: 7 * 24 * 60 * 60,
    prohibitedData: PROHIBITED_DATA,
  }),
  'approval-digest': freezeWorkflow({
    workflowKey: 'approval-digest',
    version: AUTOMATION_CONTRACT_VERSION,
    name: 'Resumen de propuestas pendientes',
    principalKeys: ['approval-digest-steward', 'approval-digest-health'],
    allowedReads: ['approvals.list'],
    allowedProposals: [],
    outputKind: 'digest',
    schedule: { cron: '15 12,19 * * *', timezone: 'America/Argentina/Cordoba' },
    retry: RETRY_CONTRACT,
    ratePerMinute: 8,
    maxConcurrency: 1,
    timeoutMs: 45_000,
    retentionSeconds: 24 * 60 * 60,
    prohibitedData: PROHIBITED_DATA,
  }),
  'planning-suggestion': freezeWorkflow({
    workflowKey: 'planning-suggestion',
    version: AUTOMATION_CONTRACT_VERSION,
    name: 'Sugerencia diaria de planificación',
    principalKeys: ['planning-suggestion'],
    allowedReads: ['tasks.list', 'calendar.upcoming'],
    allowedProposals: ['task.create.propose'],
    outputKind: 'proposal',
    schedule: { cron: '30 7 * * 1-5', timezone: 'America/Argentina/Cordoba' },
    retry: RETRY_CONTRACT,
    ratePerMinute: 10,
    maxConcurrency: 1,
    timeoutMs: 90_000,
    retentionSeconds: 7 * 24 * 60 * 60,
    prohibitedData: PROHIBITED_DATA,
  }),
}) satisfies Readonly<Record<AutomationWorkflowKey, AutomationWorkflowContract>>;

const PRINCIPALS = Object.freeze({
  'daily-briefing': Object.freeze({
    principalKey: 'daily-briefing',
    principalId: 'workflow:daily-briefing',
    workflowKey: 'daily-briefing',
    agentId: 'steward',
    credentialKeyEnv: 'OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID',
    credentialSecretEnv: 'OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET',
  }),
  'technical-watchdog': Object.freeze({
    principalKey: 'technical-watchdog',
    principalId: 'workflow:technical-watchdog',
    workflowKey: 'technical-watchdog',
    agentId: 'technical-guardian',
    credentialKeyEnv: 'OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_KEY_ID',
    credentialSecretEnv: 'OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_SECRET',
  }),
  'weekly-review': Object.freeze({
    principalKey: 'weekly-review',
    principalId: 'workflow:weekly-review',
    workflowKey: 'weekly-review',
    agentId: 'steward',
    credentialKeyEnv: 'OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_KEY_ID',
    credentialSecretEnv: 'OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_SECRET',
  }),
  'approval-digest-steward': Object.freeze({
    principalKey: 'approval-digest-steward',
    principalId: 'workflow:approval-digest-steward',
    workflowKey: 'approval-digest',
    agentId: 'steward',
    credentialKeyEnv: 'OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_KEY_ID',
    credentialSecretEnv: 'OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_SECRET',
  }),
  'approval-digest-health': Object.freeze({
    principalKey: 'approval-digest-health',
    principalId: 'workflow:approval-digest-health',
    workflowKey: 'approval-digest',
    agentId: 'health-reflection',
    credentialKeyEnv: 'OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_KEY_ID',
    credentialSecretEnv: 'OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_SECRET',
  }),
  'planning-suggestion': Object.freeze({
    principalKey: 'planning-suggestion',
    principalId: 'workflow:planning-suggestion',
    workflowKey: 'planning-suggestion',
    agentId: 'steward',
    credentialKeyEnv: 'OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_KEY_ID',
    credentialSecretEnv: 'OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_SECRET',
  }),
}) satisfies Readonly<Record<AutomationPrincipalKey, AutomationPrincipalContract>>;

export function listAutomationWorkflowContracts(): readonly AutomationWorkflowContract[] {
  return Object.freeze(AUTOMATION_WORKFLOW_KEYS.map((key) => WORKFLOWS[key]));
}

export function listAutomationPrincipalContracts(): readonly AutomationPrincipalContract[] {
  return Object.freeze(AUTOMATION_PRINCIPAL_KEYS.map((key) => PRINCIPALS[key]));
}

export function getAutomationWorkflowContract(
  workflowKey: AutomationWorkflowKey,
): AutomationWorkflowContract {
  return WORKFLOWS[workflowKey];
}

export function getAutomationPrincipalContract(
  principalKey: AutomationPrincipalKey,
): AutomationPrincipalContract {
  return PRINCIPALS[principalKey];
}

export function isAutomationPrincipalKey(value: string): value is AutomationPrincipalKey {
  return (AUTOMATION_PRINCIPAL_KEYS as readonly string[]).includes(value);
}

export function isAutomationReadAllowed(
  principalKey: AutomationPrincipalKey,
  agentId: OpenClawAgentId,
  operation: OpenClawReadOperation,
): boolean {
  const principal = PRINCIPALS[principalKey];
  if (principal.agentId !== agentId) return false;
  const contract = WORKFLOWS[principal.workflowKey];
  return contract.allowedReads.includes(operation) && isOpenClawReadAllowed(agentId, operation);
}

export function isAutomationProposalAllowed(
  principalKey: AutomationPrincipalKey,
  agentId: OpenClawAgentId,
  operation: OpenClawProposeOperation,
): boolean {
  const principal = PRINCIPALS[principalKey];
  if (principal.agentId !== agentId) return false;
  const contract = WORKFLOWS[principal.workflowKey];
  return (
    contract.allowedProposals.includes(operation) && isOpenClawProposalAllowed(agentId, operation)
  );
}

export function automationProposalSource(
  principalKey: AutomationPrincipalKey,
  agentId: OpenClawAgentId,
): `agent:${OpenClawAgentId}:workflow:${AutomationPrincipalKey}` {
  const principal = PRINCIPALS[principalKey];
  if (principal.agentId !== agentId) {
    throw new Error('automation-principal-agent-mismatch');
  }
  return `agent:${agentId}:workflow:${principalKey}`;
}

export function automationContractDoesNotEscalate(principalKey: AutomationPrincipalKey): boolean {
  const principal = PRINCIPALS[principalKey];
  const workflow = WORKFLOWS[principal.workflowKey];
  const profile = getOpenClawAgentProfile(principal.agentId);
  return (
    workflow.allowedReads.every((operation) => profile.allowedReads.includes(operation)) &&
    workflow.allowedProposals.every((operation) => profile.allowedProposals.includes(operation))
  );
}
