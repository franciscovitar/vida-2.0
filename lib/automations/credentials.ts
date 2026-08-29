/**
 * Credenciales HMAC independientes por principal de workflow.
 * Nunca se comparte una credencial entre workflows no relacionados.
 */
import { listAutomationPrincipalContracts } from '@/lib/automations/contracts';
import type { AutomationCredentialResolution } from '@/types/automations';

function trim(env: Readonly<Record<string, string | undefined>>, key: string): string {
  return env[key]?.trim() ?? '';
}

export function getAutomationWorkflowCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AutomationCredentialResolution {
  const credentials: Array<
    Extract<AutomationCredentialResolution, { ok: true }>['credentials'][number]
  > = [];

  for (const contract of listAutomationPrincipalContracts()) {
    const keyId = trim(env, contract.credentialKeyEnv);
    const secret = trim(env, contract.credentialSecretEnv);

    if (Boolean(keyId) !== Boolean(secret)) {
      return { ok: false, reason: 'incomplete-credentials' };
    }

    if (keyId && secret) {
      credentials.push({
        agentId: contract.agentId,
        keyId,
        secret,
        principalId: contract.principalId,
        workflowPrincipalKey: contract.principalKey,
        workflowKey: contract.workflowKey,
      });
    }
  }

  const keyIds = new Set<string>();
  for (const credential of credentials) {
    if (keyIds.has(credential.keyId)) {
      return { ok: false, reason: 'duplicate-key-id' };
    }
    keyIds.add(credential.keyId);
  }

  return { ok: true, credentials };
}
