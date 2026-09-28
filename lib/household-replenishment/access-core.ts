import { isEmailAuthorized, normalizeEmail, type AuthDenyReason } from '@/lib/auth/authorize';

import type { HouseholdRole } from './types';

export type HouseholdAccessSuccess = {
  ok: true;
  principalId: string;
  role: HouseholdRole;
};

export type HouseholdAccessFailure = {
  ok: false;
  reason: AuthDenyReason;
};

export type HouseholdAccessResult = HouseholdAccessSuccess | HouseholdAccessFailure;

export function evaluateHouseholdAccess(input: {
  userId: string | null | undefined;
  email: string | null | undefined;
  vidaAllowedEmails: readonly string[] | null | undefined;
  householdMemberEmails: readonly string[] | null | undefined;
}): HouseholdAccessResult {
  const email = normalizeEmail(input.email);
  const principalId = input.userId?.trim();

  if (!email || !principalId) {
    return { ok: false, reason: 'unauthenticated' };
  }

  if (isEmailAuthorized(email, input.vidaAllowedEmails)) {
    return { ok: true, principalId, role: 'OWNER' };
  }

  if (isEmailAuthorized(email, input.householdMemberEmails)) {
    return { ok: true, principalId, role: 'MEMBER' };
  }

  return { ok: false, reason: 'email-not-allowed' };
}
