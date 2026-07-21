/**
 * Lectura server-only de variables AUTH_* (login).
 * Independiente de Google Calendar OAuth.
 */
import 'server-only';

import { isAuthConfigured, resolveAllowedEmails, type EnvLike } from '@/lib/auth/authorize';

export function getAuthEnv(env: EnvLike = process.env): {
  configured: boolean;
  allowedEmails: string[];
  trustHost: boolean;
} {
  return {
    configured: isAuthConfigured(env),
    allowedEmails: resolveAllowedEmails(env),
    trustHost: env.AUTH_TRUST_HOST === 'true',
  };
}
