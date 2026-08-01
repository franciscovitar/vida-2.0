/**
 * Flags fail-closed del Bloque 5.
 * La API de automatizaciones y cada workflow nacen apagados.
 */
import {
  AUTOMATION_CONTRACT_VERSION,
  type AutomationPrincipalKey,
  type AutomationWorkflowKey,
} from '@/types/automations';
import { getAutomationPrincipalContract } from '@/lib/automations/contracts';

export type AutomationsAccessMode = 'disabled' | 'read-only' | 'proposal-only';

export type AutomationsRuntimeStatus = {
  systemEnabled: boolean;
  manualRunEnabled: boolean;
  callbackEnabled: boolean;
  orchestratorConfigured: boolean;
  storeConfigured: boolean;
  contractVersion: typeof AUTOMATION_CONTRACT_VERSION;
};

const WORKFLOW_FLAG: Readonly<Record<AutomationWorkflowKey, string>> = Object.freeze({
  'daily-briefing': 'AUTOMATIONS_DAILY_BRIEFING_ENABLED',
  'technical-watchdog': 'AUTOMATIONS_TECHNICAL_WATCHDOG_ENABLED',
  'weekly-review': 'AUTOMATIONS_WEEKLY_REVIEW_ENABLED',
  'approval-digest': 'AUTOMATIONS_APPROVAL_DIGEST_ENABLED',
  'planning-suggestion': 'AUTOMATIONS_PLANNING_SUGGESTION_ENABLED',
});

export function resolveAutomationsAccessMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AutomationsAccessMode {
  const value = env.AUTOMATIONS_ACCESS_MODE?.trim();
  if (value === 'read-only' || value === 'proposal-only') return value;
  return 'disabled';
}

export function isAutomationsApiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    env.AUTOMATIONS_API_ENABLED === 'true' &&
    resolveAutomationsAccessMode(env) !== 'disabled' &&
    env.AUTOMATIONS_WORKFLOW_CONTRACT_VERSION?.trim() === AUTOMATION_CONTRACT_VERSION
  );
}

export function isAutomationWorkflowEnabled(
  workflowKey: AutomationWorkflowKey,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return isAutomationsApiEnabled(env) && env[WORKFLOW_FLAG[workflowKey]] === 'true';
}

export function automationWorkflowFlag(workflowKey: AutomationWorkflowKey): string {
  return WORKFLOW_FLAG[workflowKey];
}

export function isAutomationPrincipalEnabled(
  principalKey: AutomationPrincipalKey,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return isAutomationWorkflowEnabled(getAutomationPrincipalContract(principalKey).workflowKey, env);
}

export function isAutomationReadAccessEnabled(
  principalKey: AutomationPrincipalKey,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return isAutomationPrincipalEnabled(principalKey, env);
}

export function isAutomationProposalAccessEnabled(
  principalKey: AutomationPrincipalKey,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    isAutomationPrincipalEnabled(principalKey, env) &&
    resolveAutomationsAccessMode(env) === 'proposal-only'
  );
}

export function isAutomationsManualRunEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.AUTOMATIONS_MANUAL_RUN_ENABLED === 'true';
}

export function isAutomationsResultCallbackEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.AUTOMATIONS_RESULT_CALLBACK_ENABLED === 'true' && isAutomationsApiEnabled(env);
}

export function isAutomationWorkflowPausedByConfig(
  workflowKey: AutomationWorkflowKey,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const suffix = workflowKey.replaceAll('-', '_').toUpperCase();
  return env[`AUTOMATIONS_${suffix}_PAUSED`] === 'true';
}
