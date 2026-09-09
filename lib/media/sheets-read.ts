import { sanitizeSheetValues } from '@/lib/data/plain';
import { fetchAccessToken, READONLY_SCOPE, SHEETS_BASE } from '@/lib/google/auth';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';
import {
  getMediaSheetsAuthConfig,
  type MediaSheetsEnv,
} from '@/lib/media/sheets-config';

export type MediaTab = 'Movies' | 'Series';

function mapHttpStatus(status: number, bodyText: string): SheetReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400 && /Unable to parse range|Unable to parse/i.test(bodyText)) {
    return 'missing-tab';
  }
  return 'read-error';
}

export async function readMediaTabValues(
  tab: MediaTab,
  env: MediaSheetsEnv = process.env,
): Promise<ReadTabResult> {
  const config = getMediaSheetsAuthConfig(env);
  if (!config) return { ok: false, code: 'not-configured' };

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
