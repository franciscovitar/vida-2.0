/**
 * CAS / state-machine transitions for proposal status updates.
 */
import type { ProposalStatus } from '@/types/actions';

const ALLOWED_TRANSITIONS: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  pending: ['executing', 'rejected', 'expired', 'failed'],
  executing: ['applied', 'failed'],
  applied: ['rolling-back'],
  'rolling-back': ['rolled-back', 'rollback-failed'],
  rejected: [],
  expired: [],
  failed: [],
  'rolled-back': [],
  'rollback-failed': [],
};

export function isAllowedProposalStatusTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

export function assertAllowedProposalStatusTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): { ok: true } | { ok: false; code: 'invalid-transition' } {
  if (!isAllowedProposalStatusTransition(from, to)) {
    return { ok: false, code: 'invalid-transition' };
  }
  return { ok: true };
}
