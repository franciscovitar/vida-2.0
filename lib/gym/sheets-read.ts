/**
 * Lectura read-only del spreadsheet canónico de Gimnasio.
 *
 * Gimnasio tiene su propia fuente de verdad y no reutiliza implícitamente el
 * spreadsheet de hábitos. El ID vive únicamente en configuración server-side.
 */
import { sanitizeSheetValues } from '@/lib/data/plain';
import { fetchAccessToken, READONLY_SCOPE, SHEETS_BASE } from '@/lib/google/auth';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';
import {
  getGymSheetsAuthConfig,
  getGymSpreadsheetId,
  type GymSheetsEnv,
} from '@/lib/gym/sheets-config';

type PlainCell = string | number | boolean | null;
type PlainRows = PlainCell[][];

function mapHttpStatus(status: number, bodyText: string): SheetReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400 && /Unable to parse range|Unable to parse/i.test(bodyText)) {
    return 'missing-tab';
  }
  return 'read-error';
}

function googleSerialDate(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.trunc(value) * 86_400_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function normalizeGymSheetValues(tab: string, values: PlainRows): PlainRows {
  if (tab !== 'Gym Sessions' || values.length <= 1) return values;

  return values.map((row, index) => {
    if (index === 0 || typeof row[1] !== 'number') return row;
    const normalizedDate = googleSerialDate(row[1]);
    if (!normalizedDate) return row;
    const next = [...row];
    next[1] = normalizedDate;
    return next;
  });
}

export function isGymSpreadsheetConfigured(env: GymSheetsEnv = process.env): boolean {
  return getGymSpreadsheetId(env) !== null;
}

export async function readGymTabValues(
  tab: string,
  env: GymSheetsEnv = process.env,
): Promise<ReadTabResult> {
  const config = getGymSheetsAuthConfig(env);
  if (!config) {
    return { ok: false, code: 'not-configured' };
  }

  const token = await fetchAccessToken(
    config.clientEmail,
    config.privateKey,
    READONLY_SCOPE,
  );
  if (!token.ok) return token;

  const range = encodeURIComponent(tab);
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${range}` +
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
    const plain = JSON.parse(JSON.stringify(sanitizeSheetValues(values))) as PlainRows;
    return { ok: true, values: normalizeGymSheetValues(tab, plain) };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}
