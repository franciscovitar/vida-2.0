/**
 * Autorización Auth pura (testeable, sin server-only ni next-auth).
 */
export type EnvLike = Record<string, string | undefined>;

export type AuthDenyReason =
  | 'not-configured'
  | 'missing-email'
  | 'email-unverified'
  | 'email-not-allowed'
  | 'unauthenticated'
  | 'expired';

export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Parsea AUTH_ALLOWED_EMAILS: comas, trim, lowercase, sin vacíos ni duplicados.
 * Lista vacía o ausente → [].
 */
export function parseAllowedEmails(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(',')) {
    const email = normalizeEmail(part);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}

export function resolveAllowedEmails(env: EnvLike): string[] {
  return parseAllowedEmails(env.AUTH_ALLOWED_EMAILS);
}

export function isAuthConfigured(env: EnvLike): boolean {
  return Boolean(
    env.AUTH_SECRET?.trim() &&
    env.AUTH_GOOGLE_ID?.trim() &&
    env.AUTH_GOOGLE_SECRET?.trim() &&
    resolveAllowedEmails(env).length > 0,
  );
}

/** Comparación exacta tras normalize (trim + lowercase) contra la lista. */
export function isEmailAuthorized(
  candidate: string | null | undefined,
  allowed: string | readonly string[] | null | undefined,
): boolean {
  const email = normalizeEmail(candidate);
  if (!email) return false;

  const entries: readonly (string | null | undefined)[] = Array.isArray(allowed)
    ? allowed
    : typeof allowed === 'string'
      ? [allowed]
      : [];

  const list = entries
    .map((entry) => normalizeEmail(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (list.length === 0) return false;
  return list.includes(email);
}

export interface GoogleSignInInput {
  provider?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  allowedEmails?: readonly string[] | null;
}

/**
 * Reglas del callback signIn de Google.
 * emailVerified === false → rechazo; null/undefined → se acepta si el email autoriza
 * (cuando el proveedor informa false se rechaza).
 */
export function evaluateGoogleSignIn(
  input: GoogleSignInInput,
): { ok: true } | { ok: false; reason: AuthDenyReason } {
  if (input.provider !== 'google') {
    return { ok: false, reason: 'unauthenticated' };
  }
  const allowed = (input.allowedEmails ?? [])
    .map((entry) => normalizeEmail(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (allowed.length === 0) {
    return { ok: false, reason: 'not-configured' };
  }
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: 'missing-email' };
  if (input.emailVerified === false) return { ok: false, reason: 'email-unverified' };
  if (!isEmailAuthorized(email, allowed)) {
    return { ok: false, reason: 'email-not-allowed' };
  }
  return { ok: true };
}

export interface SessionClaims {
  sub: string | null;
  email: string | null;
  exp?: number | null;
}

export function evaluateSessionClaims(
  claims: SessionClaims,
  allowedEmails: readonly string[] | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): { ok: true; email: string; userId: string } | { ok: false; reason: AuthDenyReason } {
  const allowed = (allowedEmails ?? [])
    .map((entry) => normalizeEmail(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (allowed.length === 0) return { ok: false, reason: 'not-configured' };
  if (!claims.sub || !claims.email) return { ok: false, reason: 'unauthenticated' };
  if (typeof claims.exp === 'number' && claims.exp > 0 && claims.exp < nowSeconds) {
    return { ok: false, reason: 'expired' };
  }
  const email = normalizeEmail(claims.email);
  if (!email) return { ok: false, reason: 'missing-email' };
  if (!isEmailAuthorized(email, allowed)) {
    return { ok: false, reason: 'email-not-allowed' };
  }
  return { ok: true, email, userId: claims.sub };
}

/** Rutas públicas del Proxy (UX). */
export function isPublicAuthPath(pathname: string): boolean {
  if (pathname === '/login' || pathname.startsWith('/login/')) return true;
  if (pathname === '/unauthorized' || pathname.startsWith('/unauthorized/')) return true;
  if (pathname.startsWith('/api/auth')) return true;
  // API OpenClaw: auth HMAC propia (sin cookie de usuario).
  if (pathname === '/api/openclaw' || pathname.startsWith('/api/openclaw/')) return true;
  return false;
}

/** Rutas de app privadas (muestra representativa + cualquier otra no pública). */
export const PROTECTED_APP_PATHS = [
  '/',
  '/agenda',
  '/tareas',
  '/proyectos',
  '/habitos',
  '/salud',
  '/productividad',
  '/tendencias',
  '/analisis-ia',
  '/bandeja',
] as const;

export type AuthProxyDecision =
  { action: 'next' } | { action: 'redirect'; pathname: '/login' | '/unauthorized' | '/' };

/**
 * Decisión pura del Proxy (sin bucles: /login y /unauthorized son públicas).
 */
export function resolveAuthProxyDecision(input: {
  pathname: string;
  hasUser: boolean;
  email: string | null | undefined;
  allowedEmails: readonly string[] | null | undefined;
}): AuthProxyDecision {
  const authorized = Boolean(input.email && isEmailAuthorized(input.email, input.allowedEmails));

  if (isPublicAuthPath(input.pathname)) {
    if (authorized && (input.pathname === '/login' || input.pathname.startsWith('/login/'))) {
      return { action: 'redirect', pathname: '/' };
    }
    return { action: 'next' };
  }

  if (!input.hasUser) {
    return { action: 'redirect', pathname: '/login' };
  }

  if (!authorized) {
    return { action: 'redirect', pathname: '/unauthorized' };
  }

  return { action: 'next' };
}

/** Payload mínimo de sesión JWT (sin tokens ni perfil). */
export function buildMinimalSessionJwt(input: { userId: string; email: string; exp: number }): {
  sub: string;
  email: string;
  exp: number;
} {
  return {
    sub: input.userId,
    email: normalizeEmail(input.email) ?? '',
    exp: input.exp,
  };
}

export function sessionJwtContainsSecrets(payload: Record<string, unknown>): boolean {
  const forbidden = [
    'accessToken',
    'refreshToken',
    'access_token',
    'refresh_token',
    'client_secret',
    'clientSecret',
    'AUTH_SECRET',
    'AUTH_GOOGLE_SECRET',
  ];
  return forbidden.some((key) => key in payload && payload[key] != null);
}

/** Detecta scopes prohibidos en la URL de autorización de login. */
export function loginAuthorizationHasCalendarScopes(url: string): boolean {
  try {
    const parsed = new URL(url);
    const scope = parsed.searchParams.get('scope') ?? '';
    return /calendar|drive|sheets|offline_access/i.test(scope);
  } catch {
    return /calendar|drive|sheets|offline_access/i.test(url);
  }
}

export const LOGIN_GOOGLE_SCOPES = 'openid email profile';
