import 'server-only';

import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import {
  resolveAllowedEmails,
  resolveHouseholdMemberEmails,
} from '@/lib/auth/authorize';

import { evaluateHouseholdAccess } from './access-core';
import { PRIMARY_HOUSEHOLD_ID } from './runtime';

export type VerifiedHouseholdAccess = {
  ok: true;
  householdId: string;
  principalId: string;
  role: 'OWNER' | 'MEMBER';
};

export type VerifyHouseholdAccessResult =
  | VerifiedHouseholdAccess
  | { ok: false; reason: 'unauthenticated' | 'email-not-allowed' };

export async function verifyHouseholdAccess(): Promise<VerifyHouseholdAccessResult> {
  let session: Awaited<ReturnType<typeof auth>> = null;
  try {
    session = await auth();
  } catch {
    return { ok: false, reason: 'unauthenticated' };
  }

  const result = evaluateHouseholdAccess({
    userId: session?.user?.id,
    email: session?.user?.email,
    vidaAllowedEmails: resolveAllowedEmails(process.env),
    householdMemberEmails: resolveHouseholdMemberEmails(process.env),
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'email-not-allowed' ? 'email-not-allowed' : 'unauthenticated',
    };
  }

  return {
    ok: true,
    householdId: PRIMARY_HOUSEHOLD_ID,
    principalId: result.principalId,
    role: result.role,
  };
}

export async function requireHouseholdAccess(): Promise<VerifiedHouseholdAccess> {
  const result = await verifyHouseholdAccess();
  if (result.ok) return result;
  if (result.reason === 'email-not-allowed') redirect('/unauthorized');
  redirect('/login?callbackUrl=/hogar/reposicion');
}
