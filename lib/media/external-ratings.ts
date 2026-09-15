import { mediaPublicKey } from '@/lib/media/key';
import type { MediaKind } from '@/types/media';

type PlainCell = string | number | boolean | null;

export type MediaExternalRatingSource =
  | 'imdb'
  | 'letterboxd'
  | 'rottentomatoes'
  | 'metacritic'
  | 'tmdb';

export interface MediaExternalRating {
  source: MediaExternalRatingSource;
  label: string;
  score: number;
}

export interface MediaExternalRatingsView {
  ratings: MediaExternalRating[];
  average: number | null;
}

export interface ExternalRatingsTarget {
  medium: MediaKind;
  imdbId: string | null;
  tmdbId: number | null;
}

export type ExternalRatingsTargetResult =
  | { ok: true; target: ExternalRatingsTarget }
  | {
      ok: false;
      code:
        | 'missing-header'
        | 'not-found'
        | 'conflict'
        | 'missing-identity';
    };

const SOURCE_ORDER: readonly MediaExternalRatingSource[] = [
  'imdb',
  'letterboxd',
  'rottentomatoes',
  'metacritic',
  'tmdb',
];

const SOURCE_LABELS: Record<MediaExternalRatingSource, string> = {
  imdb: 'IMDb',
  letterboxd: 'Letterboxd',
  rottentomatoes: 'Rotten Tomatoes',
  metacritic: 'Metacritic',
  tmdb: 'TMDB',
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function integer(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return Math.trunc(value);
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function tmdbId(value: unknown, medium: MediaKind): number | null {
  const raw = text(value);
  if (!raw) return null;
  const type = medium === 'movie' ? 'movie' : 'tv';
  const match = raw.match(new RegExp(`^tmdb:${type}:(\\d+)$`));
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function imdbId(value: unknown): string | null {
  const raw = text(value);
  return raw && /^tt\d+$/i.test(raw) ? raw.toLowerCase() : null;
}

export function mediumFromMediaPublicKey(key: string): MediaKind | null {
  if (key.startsWith('movie:')) return 'movie';
  if (key.startsWith('series:')) return 'series';
  return null;
}

export function resolveExternalRatingsTarget(
  values: PlainCell[][],
  medium: MediaKind,
  publicKey: string,
): ExternalRatingsTargetResult {
  const header = values[0] ?? [];
  const titleColumn = header.findIndex((cell) => text(cell) === 'Título');
  const yearColumn = header.findIndex((cell) => text(cell) === 'Año');
  const tmdbColumn = header.findIndex((cell) => text(cell) === 'TMDB ID');
  const imdbColumn = header.findIndex((cell) => text(cell) === 'IMDb ID');

  if (titleColumn < 0 || yearColumn < 0 || tmdbColumn < 0 || imdbColumn < 0) {
    return { ok: false, code: 'missing-header' };
  }

  const matches: ExternalRatingsTarget[] = [];
  values.slice(1).forEach((row) => {
    const title = text(row[titleColumn]);
    if (!title) return;
    const year = integer(row[yearColumn]);
    if (mediaPublicKey(medium, title, year) !== publicKey) return;
    matches.push({
      medium,
      imdbId: imdbId(row[imdbColumn]),
      tmdbId: tmdbId(row[tmdbColumn], medium),
    });
  });

  if (matches.length === 0) return { ok: false, code: 'not-found' };
  if (matches.length !== 1) return { ok: false, code: 'conflict' };
  const target = matches[0]!;
  if (!target.imdbId && target.tmdbId === null)
    return { ok: false, code: 'missing-identity' };
  return { ok: true, target };
}

function canonicalSource(value: unknown): MediaExternalRatingSource | null {
  const raw = text(value)?.toLowerCase();
  if (raw === 'imdb') return 'imdb';
  if (raw === 'letterboxd') return 'letterboxd';
  if (raw === 'tomatoes' || raw === 'tomato' || raw === 'tomatoes_rotten') {
    return 'rottentomatoes';
  }
  if (raw === 'metacritic') return 'metacritic';
  if (raw === 'tmdb') return 'tmdb';
  return null;
}

export function normalizeMdblistRatings(
  payload: unknown,
): MediaExternalRatingsView {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ratings: [], average: null };
  }
  const rawRatings = (payload as Record<string, unknown>).ratings;
  if (!Array.isArray(rawRatings)) return { ratings: [], average: null };

  const bySource = new Map<MediaExternalRatingSource, MediaExternalRating>();
  rawRatings.forEach((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const source = canonicalSource(record.source);
    if (!source || bySource.has(source)) return;
    const normalized = numberValue(record.score);
    if (normalized === null || normalized < 0 || normalized > 100) return;
    bySource.set(source, {
      source,
      label: SOURCE_LABELS[source],
      score: Math.round(normalized) / 10,
    });
  });

  const ratings = SOURCE_ORDER.flatMap((source) => {
    const rating = bySource.get(source);
    return rating ? [rating] : [];
  });
  const average =
    ratings.length === 0
      ? null
      : Math.round(
          (ratings.reduce((sum, rating) => sum + rating.score, 0) /
            ratings.length) *
            100,
        ) / 100;

  return { ratings, average };
}

function providerTypeMatches(value: unknown, medium: MediaKind): boolean {
  const raw = text(value)?.toLowerCase();
  if (!raw) return true;
  return medium === 'movie'
    ? raw === 'movie'
    : raw === 'show' || raw === 'series' || raw === 'tv';
}

export function mdblistIdentityMatches(
  payload: unknown,
  target: ExternalRatingsTarget,
): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    return false;
  const record = payload as Record<string, unknown>;
  if (!providerTypeMatches(record.type, target.medium)) return false;

  const ids =
    typeof record.ids === 'object' && record.ids !== null && !Array.isArray(record.ids)
      ? (record.ids as Record<string, unknown>)
      : {};
  const providerImdb = imdbId(ids.imdb ?? record.imdbid);
  const providerTmdb = integer(ids.tmdb ?? record.tmdbid);

  let compared = false;
  if (target.imdbId && providerImdb) {
    compared = true;
    if (providerImdb !== target.imdbId) return false;
  }
  if (target.tmdbId !== null && providerTmdb !== null) {
    compared = true;
    if (providerTmdb !== target.tmdbId) return false;
  }
  return compared;
}
