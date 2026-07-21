/**
 * DAL de sesión Auth (server-only).
 * Inyectable para pruebas vía session-core + deps.
 */
import 'server-only';

import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import {
  verifySessionCore,
  type VerifySessionResult,
  type VerifySessionSuccess,
} from '@/lib/auth/session-core';

export type {
  VerifySessionResult,
  VerifySessionSuccess,
  VerifySessionFailure,
} from '@/lib/auth/session-core';

export type VerifySessionDeps = {
  getSession?: typeof auth;
  env?: NodeJS.ProcessEnv;
  nowSeconds?: number;
};

/** Comprueba sesión autorizada sin redirigir. */
export async function verifySession(deps: VerifySessionDeps = {}): Promise<VerifySessionResult> {
  const getSession = deps.getSession ?? auth;
  return verifySessionCore({
    getSession: async () => getSession(),
    env: deps.env ?? process.env,
    nowSeconds: deps.nowSeconds,
  });
}

/** Exige sesión autorizada o redirige a /login | /unauthorized. */
export async function requireAuthorizedSession(
  deps: VerifySessionDeps = {},
): Promise<VerifySessionSuccess> {
  const result = await verifySession(deps);
  if (result.ok) return result;
  if (result.reason === 'email-not-allowed' || result.reason === 'email-unverified') {
    redirect('/unauthorized');
  }
  redirect('/login');
}
