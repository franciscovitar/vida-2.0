import 'server-only';

import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import {
  mergeObservedSeasonRating,
  resolveSeriesSeasonRatingTarget,
  seasonRatingSnapshotMatches,
  type SeriesSeasonRatingRequest,
} from '@/lib/media/season-rating';
import { parseObservedSeasonRatings } from '@/lib/media/seasons';
import {
  areMediaSheetWritesAllowed,
  getMediaSheetsAuthConfig,
  type MediaSheetsEnv,
} from '@/lib/media/sheets-config';
import { readMediaTabValues } from '@/lib/media/sheets-read';

export type SeriesSeasonRatingWriteCode =
  | 'disabled'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-header'
  | 'not-found'
  | 'conflict'
  | 'invalid-season'
  | 'write-error'
  | 'verification-error';

export type SeriesSeasonRatingWriteResult =
  | { ok: true }
  | { ok: false; code: SeriesSeasonRatingWriteCode };

function mapReadCode(code: string): SeriesSeasonRatingWriteCode {
  if (code === 'not-configured') return 'not-configured';
  if (code === 'auth-error') return 'auth-error';
  if (code === 'permission-error') return 'permission-error';
  return 'write-error';
}

function mapWriteStatus(status: number): SeriesSeasonRatingWriteCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return 'write-error';
}

function columnNumberToA1(columnNumber: number): string {
  let value = columnNumber;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export async function writeSeriesSeasonRating(
  input: SeriesSeasonRatingRequest,
  env: MediaSheetsEnv = process.env,
): Promise<SeriesSeasonRatingWriteResult> {
  if (!areMediaSheetWritesAllowed(env)) return { ok: false, code: 'disabled' };

  const config = getMediaSheetsAuthConfig(env);
  if (!config) return { ok: false, code: 'not-configured' };

  const read = await readMediaTabValues('Series', env);
  if (!read.ok) return { ok: false, code: mapReadCode(read.code) };

  const resolved = resolveSeriesSeasonRatingTarget(read.values, input.key);
  if (!resolved.ok) return resolved;
  const target = resolved.target;

  const existing = target.rawSeasonRatings;
  const hasExistingSeason = parseObservedSeasonRatings(existing).has(input.seasonNumber);
  if (
    target.totalSeasons !== null &&
    input.seasonNumber > target.totalSeasons &&
    !hasExistingSeason
  ) {
    return { ok: false, code: 'invalid-season' };
  }

  const expected = mergeObservedSeasonRating(existing, input.seasonNumber, input.rating);
  const token = await fetchAccessToken(config.clientEmail, config.privateKey, SPREADSHEETS_SCOPE);
  if (!token.ok) return { ok: false, code: mapReadCode(token.code) };

  const cell = `${columnNumberToA1(target.seasonRatingsColumn)}${target.rowNumber}`;
  const rangeA1 = `Series!${cell}`;
  const encodedRange = encodeURIComponent(rangeA1);
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodedRange}` +
    '?valueInputOption=USER_ENTERED';

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

  const verify = await readMediaTabValues('Series', env);
  if (!verify.ok) return { ok: false, code: 'verification-error' };
  if (!seasonRatingSnapshotMatches(verify.values, input.key, input.seasonNumber, input.rating)) {
    return { ok: false, code: 'verification-error' };
  }

  return { ok: true };
}
