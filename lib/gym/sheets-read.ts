/**
 * Lectura read-only del spreadsheet canónico de Gimnasio.
 *
 * Gimnasio tiene su propia fuente de verdad y no reutiliza implícitamente el
 * spreadsheet de hábitos. El ID vive únicamente en configuración server-side.
 */
import { sanitizeSheetValues } from '@/lib/data/plain';
import { normalizePrivateKey } from '@/lib/data/config';
import { fetchAccessToken, READONLY_SCOPE, SHEETS_BASE } from '@/lib/google/auth';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';

function gymSpreadsheetId(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.GOOGLE_GYM_SPREADSHEET_ID?.trim();
  if (!value || !/^[A-Za-z0-9_-]{20,}$/.test(value)) return null;
  return value;
}

function mapHttpStatus(status: number, bodyText: string): SheetReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400 && /Unable to parse range|Unable to parse/i.test(bodyText)) {
    return 'missing-tab';
  }
  return 'read-error';
}

export function isGymSpreadsheetConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return gymSpreadsheetId(env) !== null;
}

export async function readGymTabValues(
  tab: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReadTabResult> {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = gymSpreadsheetId(env);

  if (!clientEmail || !rawPrivateKey?.trim() || !spreadsheetId) {
    return { ok: false, code: 'not-configured' };
  }

  const token = await fetchAccessToken(
    clientEmail,
    normalizePrivateKey(rawPrivateKey),
    READONLY_SCOPE,
  );
  if (!token.ok) return token;

  const range = encodeURIComponent(tab);
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}` +
    `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.token}` },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'read-error' };
  }

  const bodyText = await response.text();
  if (!response.ok) {
    return { ok: false, code: mapHttpStatus(response.status, bodyText) };
  }

  try {
    const parsed = JSON.parse(bodyText) as { values?: unknown };
    const values = Array.isArray(parsed.values) ? (parsed.values as unknown[][]) : [];
    const plain = JSON.parse(JSON.stringify(sanitizeSheetValues(values))) as (
      | string
      | number
      | boolean
      | null
    )[][];
    return { ok: true, values: plain };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}
