/**
 * Núcleo inyectable de verificación de sesión (sin server-only).
 * dal.ts lo usa con auth() real; las pruebas inyectan getSession falso.
 */
import {
  evaluateSessionClaims,
  resolveAllowedEmails,
  isAuthConfigured,
  type AuthDenyReason,
  type EnvLike,
} from '@/lib/auth/authorize';

export type VerifySessionSuccess = {
  ok: true;
  email: string;
  userId: string;
};

export type VerifySessionFailure = {
  ok: false;
  reason: AuthDenyReason;
};

export type VerifySessionResult = VerifySessionSuccess | VerifySessionFailure;

export type SessionLike = {
  user?: { id?: string | null; email?: string | null } | null;
} | null;

export type VerifySessionCoreDeps = {
  getSession: () => Promise<SessionLike>;
  env: EnvLike;
  nowSeconds?: number;
};

export async function verifySessionCore(deps: VerifySessionCoreDeps): Promise<VerifySessionResult> {
  if (!isAuthConfigured(deps.env)) {
    return { ok: false, reason: 'not-configured' };
  }

  const allowedEmails = resolveAllowedEmails(deps.env);
  if (allowedEmails.length === 0) {
    return { ok: false, reason: 'not-configured' };
  }

  let session: SessionLike = null;
  try {
    session = await deps.getSession();
  } catch {
    return { ok: false, reason: 'unauthenticated' };
  }

  return evaluateSessionClaims(
    {
      sub: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      exp: null,
    },
    allowedEmails,
    deps.nowSeconds,
  );
}

/** Resultado plano para Server Actions cuando falta sesión. */
export function unauthorizedSessionFailure(operationId: string): {
  ok: false;
  code: 'unauthorized-session';
  operationId: string;
  message: string;
} {
  return {
    ok: false,
    code: 'unauthorized-session',
    operationId,
    message: 'Tenés que iniciar sesión para modificar hábitos.',
  };
}
