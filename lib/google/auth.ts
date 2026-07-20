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

/** Intercambia un JWT por access token. Nunca registra la clave ni el token. */
export async function fetchAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string = READONLY_SCOPE,
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
    const parsed = JSON.parse(bodyText) as { access_token?: unknown };
    if (typeof parsed.access_token !== 'string' || parsed.access_token.length === 0) {
      return { ok: false, code: 'auth-error' };
    }
    return { ok: true, token: parsed.access_token };
  } catch {
    return { ok: false, code: 'auth-error' };
  }
}
