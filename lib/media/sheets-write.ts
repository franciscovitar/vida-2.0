import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  fetchAccessToken,
  SHEETS_BASE,
  SPREADSHEETS_SCOPE,
} from '@/lib/google/auth';
import {
  buildViewingHistoryRow,
  hasCanonicalViewingHistorySchema,
  inspectViewingHistory,
  resolveMediaIntakeTarget,
  shouldWriteCompletionDate,
  snapshotMatchesRequest,
  type MediaIntakeRequest,
  type ViewingHistoryEvent,
} from '@/lib/media/intake';
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
import type { MediaKind } from '@/types/media';

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

export type MediaIntakeWriteCode =
  | 'disabled'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-header'
  | 'not-found'
  | 'conflict'
  | 'history-error'
  | 'write-error'
  | 'verification-error';

export type MediaIntakeWriteResult =
  | { ok: true; replay: boolean }
  | { ok: false; code: MediaIntakeWriteCode };

function tabForMedium(medium: MediaKind): MediaTab {
  return medium === 'movie' ? 'Movies' : 'Series';
}

function mapReadCode(code: string): ManualFocusWriteCode {
  if (code === 'not-configured') return 'not-configured';
  if (code === 'auth-error') return 'auth-error';
  if (code === 'permission-error') return 'permission-error';
  return 'write-error';
}

function mapIntakeReadCode(code: string): MediaIntakeWriteCode {
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

function mapIntakeWriteStatus(status: number): MediaIntakeWriteCode {
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

export async function writeMediaIntake(
  input: MediaIntakeRequest,
  env: MediaSheetsEnv = process.env,
): Promise<MediaIntakeWriteResult> {
  if (!areMediaSheetWritesAllowed(env)) return { ok: false, code: 'disabled' };

  const config = getMediaSheetsAuthConfig(env);
  if (!config) return { ok: false, code: 'not-configured' };

  const tab = tabForMedium(input.medium);
  const [titleRead, historyRead] = await Promise.all([
    readMediaTabValues(tab, env),
    readMediaTabValues('Viewing History', env),
  ]);
  if (!titleRead.ok) return { ok: false, code: mapIntakeReadCode(titleRead.code) };
  if (!historyRead.ok) return { ok: false, code: mapIntakeReadCode(historyRead.code) };

  const targetResult = resolveMediaIntakeTarget(input.medium, titleRead.values, input.key);
  if (!targetResult.ok) return targetResult;
  if (!hasCanonicalViewingHistorySchema(historyRead.values)) {
    return { ok: false, code: 'missing-header' };
  }

  const target = targetResult.target;
  const event: ViewingHistoryEvent = {
    mediaId: target.mediaId,
    medium: input.medium,
    title: target.title,
    year: target.year,
    state: input.state,
    rating: input.rating,
    date: input.date,
    comment: input.comment,
  };
  const historyInspection = inspectViewingHistory(historyRead.values, event);
  if (!historyInspection.ok) return { ok: false, code: 'missing-header' };

  const token = await fetchAccessToken(
    config.clientEmail,
    config.privateKey,
    SPREADSHEETS_SCOPE,
  );
  if (!token.ok) return { ok: false, code: mapIntakeReadCode(token.code) };

  if (!historyInspection.exists) {
    const historyRange = `'Viewing History'!A:L`;
    const appendUrl =
      `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(historyRange)}:append` +
      '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    let appendResponse: Response;
    try {
      appendResponse = await fetch(appendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: historyRange,
          majorDimension: 'ROWS',
          values: [buildViewingHistoryRow(randomUUID(), event)],
        }),
        cache: 'no-store',
      });
    } catch {
      return { ok: false, code: 'history-error' };
    }
    await appendResponse.text();
    if (!appendResponse.ok) {
      if (appendResponse.status === 401) return { ok: false, code: 'auth-error' };
      if (appendResponse.status === 403) return { ok: false, code: 'permission-error' };
      return { ok: false, code: 'history-error' };
    }

    const historyVerify = await readMediaTabValues('Viewing History', env);
    if (!historyVerify.ok) return { ok: false, code: 'verification-error' };
    const verifiedHistory = inspectViewingHistory(historyVerify.values, event);
    if (!verifiedHistory.ok || !verifiedHistory.exists) {
      return { ok: false, code: 'verification-error' };
    }
  }

  const exactWrites: {
    range: string;
    majorDimension: 'ROWS';
    values: (string | number)[][];
  }[] = [
    {
      range: `${tab}!${columnNumberToA1(target.stateColumn)}${target.rowNumber}`,
      majorDimension: 'ROWS',
      values: [[input.state]],
    },
    {
      range: `${tab}!${columnNumberToA1(target.ratingColumn)}${target.rowNumber}`,
      majorDimension: 'ROWS',
      values: [[input.rating ?? '']],
    },
    {
      range: `${tab}!${columnNumberToA1(target.commentColumn)}${target.rowNumber}`,
      majorDimension: 'ROWS',
      values: [[input.comment ?? '']],
    },
  ];
  if (shouldWriteCompletionDate(input.medium, input.state)) {
    exactWrites.push({
      range: `${tab}!${columnNumberToA1(target.completionDateColumn)}${target.rowNumber}`,
      majorDimension: 'ROWS',
      values: [[input.date]],
    });
  }

  const batchUrl = `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values:batchUpdate`;
  let writeResponse: Response;
  try {
    writeResponse = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: exactWrites }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'write-error' };
  }
  await writeResponse.text();
  if (!writeResponse.ok) {
    return { ok: false, code: mapIntakeWriteStatus(writeResponse.status) };
  }

  const snapshotVerify = await readMediaTabValues(tab, env);
  if (!snapshotVerify.ok) return { ok: false, code: 'verification-error' };
  if (!snapshotMatchesRequest(input.medium, snapshotVerify.values, input.key, input)) {
    return { ok: false, code: 'verification-error' };
  }

  return { ok: true, replay: historyInspection.exists };
}
