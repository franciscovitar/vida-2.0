import { mediaPublicKey } from '@/lib/media/key';
import type { MediaKind } from '@/types/media';

type PlainCell = string | number | boolean | null;

const MOVIE_STATES = ['Vista', 'Reveer', 'Abandonada'] as const;
const SERIES_STATES = ['Viendo', 'En pausa', 'Al día', 'Terminada', 'Abandonada', 'Reveer'] as const;

export interface MediaIntakeRequest {
  key: string;
  medium: MediaKind;
  state: string;
  date: string;
  rating: number | null;
  comment: string | null;
}

export interface MediaIntakeTarget {
  rowNumber: number;
  mediaId: string;
  title: string;
  year: number | null;
  stateColumn: number;
  ratingColumn: number;
  commentColumn: number;
  completionDateColumn: number;
}

export type MediaIntakeTargetResult =
  | { ok: true; target: MediaIntakeTarget }
  | { ok: false; code: 'missing-header' | 'not-found' | 'conflict' };

export interface ViewingHistoryEvent {
  mediaId: string;
  medium: MediaKind;
  title: string;
  year: number | null;
  state: string;
  rating: number | null;
  date: string;
  comment: string | null;
}

export type ViewingHistoryInspection =
  | { ok: true; exists: boolean }
  | { ok: false; code: 'missing-header' };

export const VIEWING_HISTORY_HEADERS = [
  'Event ID',
  'Media ID',
  'Media type',
  'Título snapshot',
  'Año snapshot',
  'Estado / evento',
  'Nota',
  'Fecha',
  'Comentario',
  'Fuente',
  'Detalle fuente',
  'Link status',
] as const;

function text(value: PlainCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function yearValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function ratingValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function canonicalDate(value: PlainCell | undefined): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (isValidIsoDate(raw)) return raw;

  const latin = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (latin) {
    const day = Number(latin[1]);
    const month = Number(latin[2]);
    const year = Number(latin[3]);
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  return `${String(parsed.getUTCFullYear()).padStart(4, '0')}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function semanticComment(value: PlainCell | undefined): string | null {
  const raw = value === null || value === undefined ? '' : String(value);
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  return normalized || null;
}

function allowedState(medium: MediaKind, state: string): boolean {
  return medium === 'movie'
    ? (MOVIE_STATES as readonly string[]).includes(state)
    : (SERIES_STATES as readonly string[]).includes(state);
}

export function mediaTrackerStates(medium: MediaKind): readonly string[] {
  return medium === 'movie' ? MOVIE_STATES : SERIES_STATES;
}

export function parseMediaIntakeRequest(value: unknown): MediaIntakeRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.medium !== 'movie' && input.medium !== 'series') return null;
  if (typeof input.key !== 'string' || typeof input.state !== 'string' || typeof input.date !== 'string') {
    return null;
  }

  const key = input.key.trim();
  const state = input.state.trim();
  const date = input.date.trim();
  if (!key || key.length > 512 || !allowedState(input.medium, state) || !isValidIsoDate(date)) {
    return null;
  }

  let rating: number | null = null;
  if (input.rating !== null && input.rating !== undefined) {
    if (typeof input.rating !== 'number' || !Number.isFinite(input.rating)) return null;
    if (input.rating < 0 || input.rating > 10) return null;
    rating = input.rating;
  }

  let comment: string | null = null;
  if (input.comment !== null && input.comment !== undefined) {
    if (typeof input.comment !== 'string' || input.comment.length > 5000) return null;
    comment = input.comment.trim() ? input.comment : null;
  }

  return { key, medium: input.medium, state, date, rating, comment };
}

export function shouldWriteCompletionDate(medium: MediaKind, state: string): boolean {
  if (medium === 'movie') return state === 'Vista' || state === 'Reveer';
  return state === 'Terminada' || state === 'Reveer';
}

export function resolveMediaIntakeTarget(
  medium: MediaKind,
  values: PlainCell[][],
  publicKey: string,
): MediaIntakeTargetResult {
  const header = values[0] ?? [];
  const titleColumn = header.findIndex((cell) => text(cell) === 'Título');
  const yearColumn = header.findIndex((cell) => text(cell) === 'Año');
  const mediaIdColumn = header.findIndex((cell) => text(cell) === 'Media ID');
  const stateColumn = header.findIndex((cell) => text(cell) === 'Estado');
  const ratingColumn = header.findIndex((cell) => text(cell) === 'Nota');
  const commentColumn = header.findIndex((cell) => text(cell) === 'Opinión personal');
  const completionHeader = medium === 'movie' ? 'Fecha vista' : 'Fecha terminada';
  const completionDateColumn = header.findIndex((cell) => text(cell) === completionHeader);

  if (
    titleColumn < 0 ||
    yearColumn < 0 ||
    mediaIdColumn < 0 ||
    stateColumn < 0 ||
    ratingColumn < 0 ||
    commentColumn < 0 ||
    completionDateColumn < 0
  ) {
    return { ok: false, code: 'missing-header' };
  }

  const matches: MediaIntakeTarget[] = [];
  values.slice(1).forEach((row, index) => {
    const title = text(row[titleColumn]);
    if (!title) return;
    const year = yearValue(row[yearColumn]);
    if (mediaPublicKey(medium, title, year) !== publicKey) return;
    const mediaId = text(row[mediaIdColumn]);
    if (!mediaId) return;
    matches.push({
      rowNumber: index + 2,
      mediaId,
      title,
      year,
      stateColumn: stateColumn + 1,
      ratingColumn: ratingColumn + 1,
      commentColumn: commentColumn + 1,
      completionDateColumn: completionDateColumn + 1,
    });
  });

  if (matches.length === 0) return { ok: false, code: 'not-found' };
  if (matches.length !== 1) return { ok: false, code: 'conflict' };
  return { ok: true, target: matches[0]! };
}

export function inspectViewingHistory(
  values: PlainCell[][],
  event: ViewingHistoryEvent,
): ViewingHistoryInspection {
  const header = values[0] ?? [];
  const indexes = new Map<string, number>();
  header.forEach((cell, index) => {
    const label = text(cell);
    if (label) indexes.set(label, index);
  });
  const required = ['Media ID', 'Estado / evento', 'Nota', 'Fecha', 'Comentario'];
  if (required.some((label) => !indexes.has(label))) return { ok: false, code: 'missing-header' };

  const mediaIdIndex = indexes.get('Media ID')!;
  const stateIndex = indexes.get('Estado / evento')!;
  const ratingIndex = indexes.get('Nota')!;
  const dateIndex = indexes.get('Fecha')!;
  const commentIndex = indexes.get('Comentario')!;
  const expectedDate = canonicalDate(event.date);
  const expectedComment = semanticComment(event.comment);

  const exists = values.slice(1).some((row) => {
    if (text(row[mediaIdIndex]) !== event.mediaId) return false;
    if (text(row[stateIndex]) !== event.state) return false;
    const currentRating = ratingValue(row[ratingIndex]);
    if (currentRating === null ? event.rating !== null : event.rating === null || Math.abs(currentRating - event.rating) > 1e-9) {
      return false;
    }
    if (canonicalDate(row[dateIndex]) !== expectedDate) return false;
    return semanticComment(row[commentIndex]) === expectedComment;
  });

  return { ok: true, exists };
}

export function hasCanonicalViewingHistorySchema(values: PlainCell[][]): boolean {
  const header = values[0] ?? [];
  if (header.length < VIEWING_HISTORY_HEADERS.length) return false;
  return VIEWING_HISTORY_HEADERS.every((label, index) => text(header[index]) === label);
}

export function buildViewingHistoryRow(
  eventId: string,
  event: ViewingHistoryEvent,
): (string | number)[] {
  return [
    eventId,
    event.mediaId,
    event.medium,
    event.title,
    event.year ?? '',
    event.state,
    event.rating ?? '',
    event.date,
    event.comment ?? '',
    'Vida Web',
    'Media tracker',
    'Linked',
  ];
}

export function snapshotMatchesRequest(
  medium: MediaKind,
  values: PlainCell[][],
  publicKey: string,
  input: MediaIntakeRequest,
): boolean {
  const resolved = resolveMediaIntakeTarget(medium, values, publicKey);
  if (!resolved.ok) return false;
  const target = resolved.target;
  const row = values[target.rowNumber - 1] ?? [];
  if (text(row[target.stateColumn - 1]) !== input.state) return false;
  const currentRating = ratingValue(row[target.ratingColumn - 1]);
  if (currentRating === null ? input.rating !== null : input.rating === null || Math.abs(currentRating - input.rating) > 1e-9) {
    return false;
  }
  if (semanticComment(row[target.commentColumn - 1]) !== semanticComment(input.comment)) return false;
  if (shouldWriteCompletionDate(medium, input.state)) {
    if (canonicalDate(row[target.completionDateColumn - 1]) !== input.date) return false;
  }
  return true;
}
