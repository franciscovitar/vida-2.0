/**
 * Local, read-only mirror of Vida's per-agent capability filtering.
 *
 * IMPORTANT: this mirror exists only to shape which operations a model is
 * offered (affordance) and to let `digital-order` stay inert without a
 * network round-trip. It is NOT a security boundary. Vida's server-side
 * authorization in `lib/openclaw/agents.ts` (`isOpenClawReadAllowed`,
 * `isOpenClawProposalAllowed`) is the sole source of truth and is
 * re-evaluated on every request regardless of what this file decides.
 * Keep this list in sync with the main app by hand; do not add operations
 * here that the main app does not also allow for the same agent.
 *
 * Canonical Vida agent identities: steward, health-reflection,
 * digital-order, technical-guardian. Planner and technical-watchdog are not
 * OpenClaw principals and must never appear here.
 */
import {
  VIDA_AGENT_IDS,
  type VidaAgentId,
  type VidaOperation,
  type VidaProposeOperation,
  type VidaReadOperation,
} from './types.js';
import {
  isVidaDirectOperation,
  isVidaProposeOperation,
  isVidaReadOperation,
} from './operations.js';

export type VidaAgentProfile = {
  readonly id: VidaAgentId;
  readonly allowedReads: readonly VidaReadOperation[];
  readonly allowedProposals: readonly VidaProposeOperation[];
};

function defineProfile(
  id: VidaAgentId,
  allowedReads: readonly VidaReadOperation[],
  allowedProposals: readonly VidaProposeOperation[],
): VidaAgentProfile {
  return Object.freeze({
    id,
    allowedReads: Object.freeze([...allowedReads]),
    allowedProposals: Object.freeze([...allowedProposals]),
  });
}

const PROFILES: Readonly<Record<VidaAgentId, VidaAgentProfile>> = Object.freeze({
  steward: defineProfile(
    'steward',
    [
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
    [
      'inbox.capture.propose',
      'task.create.propose',
      'task.change-status.propose',
      'calendar.hold.create.propose',
    ],
  ),
  'health-reflection': defineProfile(
    'health-reflection',
    ['areas.get', 'gym.summary', 'approvals.list', 'documents.search', 'document.get'],
    ['gym.session.create.propose'],
  ),
  'digital-order': defineProfile('digital-order', [], []),
  'technical-guardian': defineProfile(
    'technical-guardian',
    ['technical.status', 'technical.logs'],
    [],
  ),
});

export function isVidaAgentId(value: string): value is VidaAgentId {
  return (VIDA_AGENT_IDS as readonly string[]).includes(value);
}

export function getVidaAgentProfile(agentId: VidaAgentId): VidaAgentProfile {
  return PROFILES[agentId];
}

/**
 * Local affordance check only. `system.health` is intentionally universal:
 * it mirrors Vida's real `/api/openclaw/v1/health` route, which is gated by
 * authentication alone and carries no Vida data, so it does not grant
 * `digital-order` (or any agent) any data capability.
 */
export function isOperationAllowedForAgent(
  agentId: VidaAgentId,
  operation: VidaOperation,
): boolean {
  if (operation === 'system.health') return true;
  if (isVidaDirectOperation(operation)) return agentId === 'steward';
  if (isVidaReadOperation(operation)) return PROFILES[agentId].allowedReads.includes(operation);
  if (isVidaProposeOperation(operation))
    return PROFILES[agentId].allowedProposals.includes(operation);
  return false;
}

/** Every operation this agent may be offered, including the universal health check. */
export function listAllowedOperationsForAgent(agentId: VidaAgentId): readonly VidaOperation[] {
  const profile = PROFILES[agentId];
  return [
    ...profile.allowedReads,
    ...profile.allowedProposals,
    ...(agentId === 'steward' ? (['inbox.capture.direct'] as const) : []),
    'system.health',
  ];
}

/** Whether this agent has any Vida-data capability at all (excludes the universal health check). */
export function hasAnyDataCapability(agentId: VidaAgentId): boolean {
  const profile = PROFILES[agentId];
  return (
    profile.allowedReads.length > 0 || profile.allowedProposals.length > 0 || agentId === 'steward'
  );
}
