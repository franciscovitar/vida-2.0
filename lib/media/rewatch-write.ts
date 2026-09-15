import 'server-only';

import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import { resolveMediaIntakeTarget } from '@/lib/media/intake';
import { columnNumberToA1 } from '@/lib/media/manual-focus';
import {
  canToggleRewatch,
  rewatchTargetState,
  type MediaRewatchRequest,
} from '@/lib/media/rewatch';
import {
  areMediaSheetWritesAllowed,
  getMediaSheetsAuthConfig,
  type MediaSheetsEnv,
} from '@/lib/media/sheets-config';
import { readMediaTabValues, type MediaTab } from '@/lib/media/sheets-read';
import type { MediaKind } from '@/types/media';

export type MediaRewatchWriteCode =
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

export type MediaRewatchWriteResult =
  { ok: true; replay: boolean } | { ok: false; code: MediaRewatchWriteCode };

function tabForMedium(medium: MediaKind): MediaTab {
  return medium === 'movie' ? 'Movies' : 'Series';
}

function mapReadCode(code: string): MediaRewatchWriteCode {
  if (code === 'not-configured') return 'not-configured';
  if (code === 'auth-error') return 'auth-error';
  if (code === 'permission-error') return 'permission-error';
  return 'write-error';
}

function mapWriteStatus(status: number): MediaRewatchWriteCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return 'write-error';
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export async function writeMediaRewatch(
  input: MediaRewatchRequest,
  env: MediaSheetsEnv = process.env,
): Promise<MediaRewatchWriteResult> {
  if (!areMediaSheetWritesAllowed(env)) return { ok: false, code: 'disabled' };

  const config = getMediaSheetsAuthConfig(env);
  if (!config) return { ok: false, code: 'not-configured' };

  const tab = tabForMedium(input.medium);
  const read = await readMediaTabValues(tab, env);
  if (!read.ok) return { ok: false, code: mapReadCode(read.code) };

  const targetResult = resolveMediaIntakeTarget(input.medium, read.values, input.key);
  if (!targetResult.ok) return targetResult;

  const target = targetResult.target;
  const row = read.values[target.rowNumber - 1] ?? [];
  const currentState = cellText(row[target.stateColumn - 1]);
  if (!canToggleRewatch(input.medium, currentState, input.enabled)) {
    return { ok: false, code: 'invalid-state' };
  }

  const nextState = rewatchTargetState(input.medium, input.enabled);
  if (currentState === nextState) return { ok: true, replay: true };

  const token = await fetchAccessToken(config.clientEmail, config.privateKey, SPREADSHEETS_SCOPE);
  if (!token.ok) return { ok: false, code: mapReadCode(token.code) };

  const cell = `${columnNumberToA1(target.stateColumn)}${target.rowNumber}`;
  const rangeA1 = `${tab}!${cell}`;
  const encodedRange = encodeURIComponent(rangeA1);
  const writeUrl =
    `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodedRange}` +
    '?valueInputOption=USER_ENTERED';

  let writeResponse: Response;
  try {
    writeResponse = await fetch(writeUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: rangeA1,
        majorDimension: 'ROWS',
        values: [[nextState]],
      }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'write-error' };
  }

  await writeResponse.text();
  if (!writeResponse.ok) {
    return { ok: false, code: mapWriteStatus(writeResponse.status) };
  }

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
    const actual = cellText(parsed.values?.[0]?.[0]);
    if (actual !== nextState) return { ok: false, code: 'verification-error' };
  } catch {
    return { ok: false, code: 'verification-error' };
  }

  return { ok: true, replay: false };
}
