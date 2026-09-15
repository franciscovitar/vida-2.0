import { mediaPublicKey } from '@/lib/media/key';
import { parseObservedSeasonRatings } from '@/lib/media/seasons';

type PlainCell = string | number | boolean | null;

export interface SeriesSeasonRatingRequest {
  key: string;
  seasonNumber: number;
  rating: number | null;
}

export interface SeriesSeasonRatingTarget {
  rowNumber: number;
  mediaId: string;
  title: string;
  year: number | null;
  seasonRatingsColumn: number;
  totalSeasons: number | null;
  rawSeasonRatings: string | null;
}

export type SeriesSeasonRatingTargetResult =
  | { ok: true; target: SeriesSeasonRatingTarget }
  | { ok: false; code: 'missing-header' | 'not-found' | 'conflict' };

function text(value: PlainCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function integerValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function yearValue(value: PlainCell | undefined): number | null {
  return integerValue(value);
}

export function parseSeriesSeasonRatingRequest(value: unknown): SeriesSeasonRatingRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.key !== 'string' || typeof input.seasonNumber !== 'number') return null;

  const key = input.key.trim();
  const seasonNumber = input.seasonNumber;
  if (
    !key ||
    key.length > 512 ||
    !Number.isInteger(seasonNumber) ||
    seasonNumber < 1 ||
    seasonNumber > 100
  ) {
    return null;
  }

  let rating: number | null = null;
  if (input.rating !== null && input.rating !== undefined) {
    if (typeof input.rating !== 'number' || !Number.isFinite(input.rating)) return null;
    if (input.rating < 0 || input.rating > 10) return null;
    rating = input.rating;
  }

  return { key, seasonNumber, rating };
}

export function resolveSeriesSeasonRatingTarget(
  values: PlainCell[][],
  publicKey: string,
): SeriesSeasonRatingTargetResult {
  const header = values[0] ?? [];
  const titleColumn = header.findIndex((cell) => text(cell) === 'Título');
  const yearColumn = header.findIndex((cell) => text(cell) === 'Año');
  const mediaIdColumn = header.findIndex((cell) => text(cell) === 'Media ID');
  const totalSeasonsColumn = header.findIndex((cell) => text(cell) === 'Temporadas');
  const seasonRatingsColumn = header.findIndex((cell) => text(cell) === 'Notas por temporada');

  if (
    titleColumn < 0 ||
    yearColumn < 0 ||
    mediaIdColumn < 0 ||
    totalSeasonsColumn < 0 ||
    seasonRatingsColumn < 0
  ) {
    return { ok: false, code: 'missing-header' };
  }

  const matches: SeriesSeasonRatingTarget[] = [];
  values.slice(1).forEach((row, index) => {
    const title = text(row[titleColumn]);
    if (!title) return;
    const year = yearValue(row[yearColumn]);
    if (mediaPublicKey('series', title, year) !== publicKey) return;
    const mediaId = text(row[mediaIdColumn]);
    if (!mediaId) return;
    matches.push({
      rowNumber: index + 2,
      mediaId,
      title,
      year,
      seasonRatingsColumn: seasonRatingsColumn + 1,
      totalSeasons: integerValue(row[totalSeasonsColumn]),
      rawSeasonRatings: text(row[seasonRatingsColumn]),
    });
  });

  if (matches.length === 0) return { ok: false, code: 'not-found' };
  if (matches.length !== 1) return { ok: false, code: 'conflict' };
  return { ok: true, target: matches[0]! };
}

export function serializeObservedSeasonRatings(ratings: ReadonlyMap<number, number>): string {
  return [...ratings.entries()]
    .sort(([left], [right]) => left - right)
    .map(([seasonNumber, rating]) => `T${seasonNumber} ${String(rating)}`)
    .join(' / ');
}

export function mergeObservedSeasonRating(
  raw: string | null,
  seasonNumber: number,
  rating: number | null,
): string {
  const ratings = parseObservedSeasonRatings(raw);
  if (rating === null) ratings.delete(seasonNumber);
  else ratings.set(seasonNumber, rating);
  return serializeObservedSeasonRatings(ratings);
}

export function seasonRatingSnapshotMatches(
  values: PlainCell[][],
  publicKey: string,
  seasonNumber: number,
  rating: number | null,
): boolean {
  const resolved = resolveSeriesSeasonRatingTarget(values, publicKey);
  if (!resolved.ok) return false;
  const ratings = parseObservedSeasonRatings(resolved.target.rawSeasonRatings);
  const actual = ratings.get(seasonNumber) ?? null;
  return actual === null ? rating === null : rating !== null && Math.abs(actual - rating) <= 1e-9;
}
