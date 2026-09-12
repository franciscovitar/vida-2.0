import 'server-only';

import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import {
  columnNumberToA1,
  resolveManualFocusTarget,
  type ManualFocusRequest,
} from '@/lib/media/manual-focus';
import {
  areMediaSheetWritesAllowed,
  getMediaSheetsAuthConfig,
  type MediaSheetsEnv,
} from '@/lib/media/sheets-config';
import { readMediaTabValues, type MediaTab } from '@/lib/media/sheets-read';

export type ManualFocusWriteCode =
  | 'disabled'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-header'
  | 'not-found'
  | 'conflict'
  | 'invalid-state'
  | 'write-error'
  | 'verification-error';

export type ManualFocusWriteResult =
  | { ok: true }
  | { ok: false; code: ManualFocusWriteCode };

function tabForMedium(medium: ManualFocusRequest['medium']): MediaTab {
  return medium === 'movie' ? 'Movies' : 'Series';
}

function mapReadCode(code: string): ManualFocusWriteCode {
  if (code === 'not-configured') return 'not-configured';
  if (code === 'auth-error') return 'auth-error';
  if (code === 'permission-error') return 'permission-error';
  return 'write-error';
}

function mapWriteStatus(status: number): ManualFocusWriteCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return 'write-error';
}

export async function writeManualFocusLevel(
  input: ManualFocusRequest,
  env: MediaSheetsEnv = process.env,
): Promise<ManualFocusWriteResult> {
  if (!areMediaSheetWritesAllowed(env)) return { ok: false, code: 'disabled' };

  const config = getMediaSheetsAuthConfig(env);
  if (!config) return { ok: false, code: 'not-configured' };

  const tab = tabForMedium(input.medium);
  const read = await readMediaTabValues(tab, env);
  if (!read.ok) return { ok: false, code: mapReadCode(read.code) };

  const target = resolveManualFocusTarget(input.medium, read.values, input.key);
  if (!target.ok) return target;

  const token = await fetchAccessToken(
    config.clientEmail,
    config.privateKey,
    SPREADSHEETS_SCOPE,
  );
  if (!token.ok) return { ok: false, code: mapReadCode(token.code) };

  const cell = `${columnNumberToA1(target.columnNumber)}${target.rowNumber}`;
  const rangeA1 = `${tab}!${cell}`;
  const encodedRange = encodeURIComponent(rangeA1);
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodedRange}` +
    '?valueInputOption=USER_ENTERED';
  const expected = input.level === null ? '' : String(input.level);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: rangeA1,
        majorDimension: 'ROWS',
        values: [[expected]],
      }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'write-error' };
  }

  await response.text();
  if (!response.ok) return { ok: false, code: mapWriteStatus(response.status) };

  const verifyUrl =
    `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodedRange}` +
    '?valueRenderOption=UNFORMATTED_VALUE';
  try {
    const verify = await fetch(verifyUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.token}` },
      cache: 'no-store',
    });
    const bodyText = await verify.text();
    if (!verify.ok) return { ok: false, code: 'verification-error' };
    const parsed = JSON.parse(bodyText) as { values?: unknown[][] };
    const actual = parsed.values?.[0]?.[0] ?? '';
    if (String(actual ?? '').trim() !== expected) {
      return { ok: false, code: 'verification-error' };
    }
  } catch {
    return { ok: false, code: 'verification-error' };
  }

  return { ok: true };
}
