/**
 * Autenticación JWT de la cuenta de servicio (solo servidor).
 * Soporta scope de lectura y el mínimo necesario para escritura de celdas.
 */
import { createSign, randomUUID } from 'node:crypto';

import type { SheetReadCode } from './errors';

export const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
/** Scope mínimo para leer/escribir celdas (sin Drive ni cambios estructurales). */
export const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const TOKEN_CACHE_SAFETY_WINDOW_MS = 5 * 60 * 1000;

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedAccessToken>();
const tokenRequests = new Map<string, Promise<AccessTokenResult>>();

function base64Url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function buildServiceAccountJwt(clientEmail: string, privateKey: string, scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      jti: randomUUID(),
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`;
}

export type AccessTokenResult = { ok: true; token: string } | { ok: false; code: SheetReadCode };

function tokenCacheKey(clientEmail: string, scope: string): string {
  return `${clientEmail}\u0000${scope}`;
}

async function exchangeAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string,
  cacheKey: string,
): Promise<AccessTokenResult> {
  let assertion: string;
  try {
    assertion = buildServiceAccountJwt(clientEmail, privateKey, scope);
  } catch {
    return { ok: false, code: 'auth-error' };
  }

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'auth-error' };
  }

  const bodyText = await response.text();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: response.status === 403 ? 'permission-error' : 'auth-error' };
    }
    return { ok: false, code: 'auth-error' };
  }

  try {
    const parsed = JSON.parse(bodyText) as { access_token?: unknown; expires_in?: unknown };
    if (typeof parsed.access_token !== 'string' || parsed.access_token.length === 0) {
      return { ok: false, code: 'auth-error' };
    }

    const expiresIn =
      typeof parsed.expires_in === 'number'
        ? parsed.expires_in
        : typeof parsed.expires_in === 'string'
          ? Number(parsed.expires_in)
          : Number.NaN;
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      tokenCache.set(cacheKey, {
        token: parsed.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
      });
    }

    return { ok: true, token: parsed.access_token };
  } catch {
    return { ok: false, code: 'auth-error' };
  }
}

/**
 * Intercambia un JWT por access token y reutiliza el token efímero mientras
 * conserva margen suficiente antes de su vencimiento. Dos lecturas concurrentes
 * con la misma cuenta/scope comparten el mismo intercambio OAuth; el token sólo
 * vive en memoria del runtime y nunca se persiste ni registra.
 */
export async function fetchAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string = READONLY_SCOPE,
): Promise<AccessTokenResult> {
  const cacheKey = tokenCacheKey(clientEmail, scope);
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt - TOKEN_CACHE_SAFETY_WINDOW_MS > Date.now()) {
      return { ok: true, token: cached.token };
    }
    tokenCache.delete(cacheKey);
  }

  const pending = tokenRequests.get(cacheKey);
  if (pending) return pending;

  const request = exchangeAccessToken(clientEmail, privateKey, scope, cacheKey).finally(() => {
    tokenRequests.delete(cacheKey);
  });
  tokenRequests.set(cacheKey, request);
  return request;
}
