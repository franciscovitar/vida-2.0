/**
 * Lectura del Sheet DEV sin googleapis/gaxios.
 *
 * Usa JWT (crypto de Node) + fetch. Así nunca entran en el pipeline de React
 * objetos GaxiosError, Buffer de respuesta ni ArrayBuffer no clonables.
 */
import { createSign, randomUUID } from 'node:crypto';

import { sanitizeSheetValues } from '@/lib/data/plain';
import { assertAllowedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

import { getGoogleConfig } from '../data/config';
import type { ReadTabResult, SheetReadCode } from './errors';

const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function base64Url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function mapHttpStatus(status: number, bodyText: string): SheetReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400 && /Unable to parse range|Unable to parse/i.test(bodyText)) {
    return 'missing-tab';
  }
  return 'read-error';
}

/** Firma un JWT de cuenta de servicio para el scope readonly. */
function buildServiceAccountJwt(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: READONLY_SCOPE,
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
  const signature = base64Url(signer.sign(privateKey));
  return `${unsigned}.${signature}`;
}

/** Intercambia el JWT por un access token. Devuelve el token o un código de error. */
async function fetchAccessToken(
  clientEmail: string,
  privateKey: string,
): Promise<{ ok: true; token: string } | { ok: false; code: SheetReadCode }> {
  let assertion: string;
  try {
    assertion = buildServiceAccountJwt(clientEmail, privateKey);
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
    return { ok: false, code: mapHttpStatus(response.status, bodyText) };
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

/**
 * Lee los valores de una pestaña completa (rango = nombre de la pestaña).
 * Devuelve valores planos serializables o un código de error; nunca lanza.
 */
export async function readTabValues(tab: string): Promise<ReadTabResult> {
  try {
    const result = getGoogleConfig();
    if (!result.ok) {
      return { ok: false, code: 'not-configured' };
    }

    const { clientEmail, privateKey, spreadsheetId } = result.config;

    try {
      assertAllowedSpreadsheetId(spreadsheetId);
    } catch {
      return { ok: false, code: 'read-error' };
    }

    const tokenResult = await fetchAccessToken(clientEmail, privateKey);
    if (!tokenResult.ok) {
      return { ok: false, code: tokenResult.code };
    }

    const range = encodeURIComponent(tab);
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}` +
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenResult.token}` },
        cache: 'no-store',
      });
    } catch {
      return { ok: false, code: 'read-error' };
    }

    const bodyText = await response.text();
    if (!response.ok) {
      return { ok: false, code: mapHttpStatus(response.status, bodyText) };
    }

    let values: unknown[][] = [];
    try {
      const parsed = JSON.parse(bodyText) as { values?: unknown };
      if (Array.isArray(parsed.values)) {
        values = parsed.values as unknown[][];
      }
    } catch {
      return { ok: false, code: 'read-error' };
    }

    // Round-trip JSON para garantizar un grafo 100% plano (sin prototipos raros).
    const plain = JSON.parse(JSON.stringify(sanitizeSheetValues(values))) as (
      string | number | boolean | null
    )[][];

    return { ok: true, values: plain };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}

/** Mapeo de fallos HTTP (exportado para pruebas; ya no usa gaxios). */
export function mapGoogleFailure(error: unknown, tab: string): SheetReadCode {
  void tab;
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const status = record.status ?? record.code;
    if (status === 401) return 'auth-error';
    if (status === 403) return 'permission-error';
    if (typeof status === 'number') return mapHttpStatus(status, String(record.message ?? ''));
  }
  return 'read-error';
}
