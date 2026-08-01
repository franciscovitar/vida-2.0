import { getAutomationWorkflowContract } from '@/lib/automations/contracts';
import {
  AUTOMATION_WORKFLOW_KEYS,
  type AutomationPrincipalKey,
  type AutomationWorkflowKey,
} from '@/types/automations';

export type ManualAutomationRequest = {
  workflowKey: AutomationWorkflowKey;
  principalKey: AutomationPrincipalKey;
};

function isAutomationWorkflowKey(value: string): value is AutomationWorkflowKey {
  return (AUTOMATION_WORKFLOW_KEYS as readonly string[]).includes(value);
}

/**
 * Frontera pura para la acción Web. El cliente solo elige un workflow y confirma;
 * principal, scopes y permisos siempre se resuelven desde el contrato inmutable.
 */
export function resolveManualAutomationRequest(input: {
  workflowKey: unknown;
  confirmed: unknown;
}): ManualAutomationRequest | null {
  if (
    typeof input.workflowKey !== 'string' ||
    !isAutomationWorkflowKey(input.workflowKey) ||
    input.confirmed !== true
  )
    return null;
  const contract = getAutomationWorkflowContract(input.workflowKey);
  if (contract.principalKeys.length !== 1) return null;
  return { workflowKey: contract.workflowKey, principalKey: contract.principalKeys[0]! };
}
