/**
 * Perfiles canónicos e inmutables de agentes especializados (Block 4).
 * La identidad se resuelve exclusivamente desde credenciales server-side.
 */
import {
  OPENCLAW_AGENT_IDS,
  type OpenClawAgentCredential,
  type OpenClawAgentCredentialsResolution,
  type OpenClawAgentId,
  type OpenClawAgentProfile,
  type OpenClawProposeOperation,
  type OpenClawReadOperation,
} from '@/types/openclaw';
import type { WebCatalogEntry } from '@/types/web-catalog';

const PROFILES: Readonly<Record<OpenClawAgentId, OpenClawAgentProfile>> = {
  steward: {
    id: 'steward',
    name: 'Mayordomo',
    allowedReads: [
      'system.overview',
      'areas.list',
      'areas.get',
      'tasks.list',
      'projects.list',
      'calendar.upcoming',
      'approvals.list',
      'documents.search',
      'document.get',
    ],
    allowedProposals: [
      'inbox.capture.propose',
      'task.create.propose',
      'task.change-status.propose',
      'calendar.hold.create.propose',
    ],
    areaScopes: ['facultad', 'genova-trabajo', 'salud', 'vida-personal'],
    approvalsScope: 'own',
    documentScope: 'general',
    maxPrivacy: 'general',
  },
  'health-reflection': {
    id: 'health-reflection',
    name: 'Salud y reflexión',
    allowedReads: [
      'areas.get',
      'gym.summary',
      'approvals.list',
      'documents.search',
      'document.get',
    ],
    allowedProposals: ['gym.session.create.propose'],
    areaScopes: ['salud'],
    approvalsScope: 'own',
    documentScope: 'health',
    maxPrivacy: 'health',
  },
  'digital-order': {
    id: 'digital-order',
    name: 'Orden digital',
    allowedReads: [],
    allowedProposals: [],
    areaScopes: [],
    approvalsScope: 'none',
    documentScope: 'none',
    maxPrivacy: 'general',
  },
  'technical-guardian': {
    id: 'technical-guardian',
    name: 'Guardián técnico',
    allowedReads: ['technical.status', 'technical.logs'],
    allowedProposals: [],
    areaScopes: [],
    approvalsScope: 'none',
    documentScope: 'none',
    maxPrivacy: 'technical',
  },
};

const CREDENTIAL_ENV = [
  {
    agentId: 'steward',
    keyVar: 'OPENCLAW_STEWARD_API_KEY_ID',
    secretVar: 'OPENCLAW_STEWARD_API_SECRET',
  },
  {
    agentId: 'health-reflection',
    keyVar: 'OPENCLAW_HEALTH_REFLECTION_API_KEY_ID',
    secretVar: 'OPENCLAW_HEALTH_REFLECTION_API_SECRET',
  },
  {
    agentId: 'digital-order',
    keyVar: 'OPENCLAW_DIGITAL_ORDER_API_KEY_ID',
    secretVar: 'OPENCLAW_DIGITAL_ORDER_API_SECRET',
  },
  {
    agentId: 'technical-guardian',
    keyVar: 'OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID',
    secretVar: 'OPENCLAW_TECHNICAL_GUARDIAN_API_SECRET',
  },
] as const satisfies readonly {
  agentId: OpenClawAgentId;
  keyVar: string;
  secretVar: string;
}[];

export function isOpenClawAgentId(value: string): value is OpenClawAgentId {
  return (OPENCLAW_AGENT_IDS as readonly string[]).includes(value);
}

export function getOpenClawAgentProfile(agentId: OpenClawAgentId): OpenClawAgentProfile {
  return PROFILES[agentId];
}

export function listOpenClawAgentProfiles(): readonly OpenClawAgentProfile[] {
  return OPENCLAW_AGENT_IDS.map((id) => PROFILES[id]);
}

export function isOpenClawReadAllowed(
  agentId: OpenClawAgentId,
  operation: OpenClawReadOperation,
): boolean {
  return PROFILES[agentId].allowedReads.includes(operation);
}

export function isOpenClawProposalAllowed(
  agentId: OpenClawAgentId,
  operation: OpenClawProposeOperation,
): boolean {
  if (operation === 'calendar.block.propose') {
    return PROFILES[agentId].allowedProposals.includes('calendar.hold.create.propose');
  }
  return PROFILES[agentId].allowedProposals.includes(operation);
}

export function isOpenClawAreaAllowed(
  agentId: OpenClawAgentId,
  slug: OpenClawAgentProfile['areaScopes'][number],
): boolean {
  return PROFILES[agentId].areaScopes.includes(slug);
}

export function isOpenClawDocumentEntryAllowed(
  agentId: OpenClawAgentId,
  entry: Pick<WebCatalogEntry, 'renderMode' | 'privacy' | 'section'>,
): boolean {
  const profile = PROFILES[agentId];
  if (profile.documentScope === 'none') return false;

  // La política generalAI del catálogo sigue siendo la primera barrera.
  if (
    entry.privacy === 'private' ||
    entry.privacy === 'system' ||
    entry.privacy === 'excluded' ||
    entry.section === 'private' ||
    entry.section === 'system'
  ) {
    return false;
  }

  if (profile.documentScope === 'general') return true;
  return entry.renderMode === 'health' || entry.renderMode === 'gym';
}

export function openClawAgentSource(agentId: OpenClawAgentId): `agent:${OpenClawAgentId}` {
  return `agent:${agentId}`;
}

function trim(env: Readonly<Record<string, string | undefined>>, key: string): string {
  return env[key]?.trim() ?? '';
}

export function getOpenClawAgentCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawAgentCredentialsResolution {
  const specializedPresent = CREDENTIAL_ENV.some(({ keyVar, secretVar }) =>
    Boolean(trim(env, keyVar) || trim(env, secretVar)),
  );

  const credentials: OpenClawAgentCredential[] = [];

  if (specializedPresent) {
    for (const spec of CREDENTIAL_ENV) {
      const keyId = trim(env, spec.keyVar);
      const secret = trim(env, spec.secretVar);
      if (Boolean(keyId) !== Boolean(secret)) {
        return { ok: false, reason: 'incomplete-credentials' };
      }
      if (keyId && secret) {
        credentials.push({ agentId: spec.agentId, keyId, secret });
      }
    }
  } else {
    const keyId = trim(env, 'OPENCLAW_API_KEY_ID');
    const secret = trim(env, 'OPENCLAW_API_SECRET');
    if (Boolean(keyId) !== Boolean(secret)) {
      return { ok: false, reason: 'incomplete-credentials' };
    }
    if (keyId && secret) {
      // Compatibilidad de migración: la credencial global histórica representa al Mayordomo.
      credentials.push({ agentId: 'steward', keyId, secret });
    }
  }

  if (credentials.length === 0) {
    return { ok: false, reason: 'no-credentials' };
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

export function resolveOpenClawAgentCredential(
  keyId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawAgentCredential | null {
  const resolved = getOpenClawAgentCredentials(env);
  if (!resolved.ok) return null;
  return resolved.credentials.find((item) => item.keyId === keyId) ?? null;
}
