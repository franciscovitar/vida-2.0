/**
 * Snapshot sanitizado de configuración de agentes.
 * Nunca devuelve nombres de variables, key IDs ni secretos.
 *
 * Módulo puro y testeable. La frontera server-only permanece en sus callers:
 * reads.ts y la página Server Component de Ajustes.
 */
import { getOpenClawAgentProfile } from '@/lib/openclaw/agents';
import { getOpenClawRuntimeStatus } from '@/lib/openclaw/config';
import { OPENCLAW_AGENT_IDS, type OpenClawAgentId } from '@/types/openclaw';

type Env = Readonly<Record<string, string | undefined>>;

export type OpenClawAgentConfigurationStatus =
  'ready' | 'pending-credentials' | 'misconfigured' | 'disabled';

export type OpenClawAgentStatusView = {
  id: OpenClawAgentId;
  name: string;
  status: OpenClawAgentConfigurationStatus;
  reads: number;
  proposals: number;
  externalAccess: 'none' | 'pending-authorization';
};

const PAIRS: Readonly<Record<OpenClawAgentId, readonly [string, string]>> = {
  steward: ['OPENCLAW_STEWARD_API_KEY_ID', 'OPENCLAW_STEWARD_API_SECRET'],
  'health-reflection': [
    'OPENCLAW_HEALTH_REFLECTION_API_KEY_ID',
    'OPENCLAW_HEALTH_REFLECTION_API_SECRET',
  ],
  'digital-order': ['OPENCLAW_DIGITAL_ORDER_API_KEY_ID', 'OPENCLAW_DIGITAL_ORDER_API_SECRET'],
  'technical-guardian': [
    'OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID',
    'OPENCLAW_TECHNICAL_GUARDIAN_API_SECRET',
  ],
};

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function pairState(env: Env, pair: readonly [string, string]): 'ready' | 'missing' | 'partial' {
  const key = present(env[pair[0]]);
  const secret = present(env[pair[1]]);
  if (key && secret) return 'ready';
  if (key || secret) return 'partial';
  return 'missing';
}

export function getOpenClawAgentStatuses(
  env: Env = process.env,
): readonly OpenClawAgentStatusView[] {
  const runtime = getOpenClawRuntimeStatus(env);
  const specializedPresent = OPENCLAW_AGENT_IDS.some(
    (id) => pairState(env, PAIRS[id]) !== 'missing',
  );
  const legacy = pairState(env, ['OPENCLAW_API_KEY_ID', 'OPENCLAW_API_SECRET']);

  return OPENCLAW_AGENT_IDS.map((id) => {
    const profile = getOpenClawAgentProfile(id);
    const state = specializedPresent
      ? pairState(env, PAIRS[id])
      : id === 'steward'
        ? legacy
        : 'missing';

    const status: OpenClawAgentConfigurationStatus =
      runtime === 'disabled'
        ? 'disabled'
        : state === 'partial'
          ? 'misconfigured'
          : state === 'ready' && runtime === 'read-only'
            ? 'ready'
            : 'pending-credentials';

    return {
      id,
      name: profile.name,
      status,
      reads: profile.allowedReads.length,
      proposals: profile.allowedProposals.length,
      externalAccess: id === 'digital-order' ? 'pending-authorization' : 'none',
    };
  });
}
