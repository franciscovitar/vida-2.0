import type { MediaSeasonView, MediaTitleView } from '@/types/media';

function normalizeState(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-AR');
}

function finiteRating(raw: string): number | null {
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
}

/**
 * Conserva las notas observadas por temporada sin inventar faltantes.
 * Soporta el formato explícito `T1 8.5 / T2 7.75` y el legado secuencial
 * `8.5 / 8 / 7.75`, donde la posición es la temporada.
 */
export function parseObservedSeasonRatings(raw: string | null): Map<number, number> {
  const ratings = new Map<number, number>();
  if (!raw?.trim()) return ratings;

  const parts = raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  let foundExplicit = false;
  for (const part of parts) {
    const match = part.match(/^(?:t|temp(?:orada)?)\s*(\d+)\s*[:=\-]?\s*(\d+(?:[.,]\d+)?)$/i);
    if (!match) continue;
    const season = Number(match[1]);
    const rating = finiteRating(match[2] ?? '');
    if (!Number.isInteger(season) || season < 1 || rating === null) continue;
    ratings.set(season, rating);
    foundExplicit = true;
  }

  if (foundExplicit) return ratings;

  parts.forEach((part, index) => {
    if (!/^\d+(?:[.,]\d+)?$/.test(part)) return;
    const rating = finiteRating(part);
    if (rating !== null) ratings.set(index + 1, rating);
  });

  return ratings;
}

export function deriveNextSeasonNumber(
  state: string,
  totalSeasons: number | null,
  observedRatings: ReadonlyMap<number, number>,
): number | null {
  const normalized = normalizeState(state);

  if (normalized === 'por ver') {
    return totalSeasons !== 0 ? 1 : null;
  }

  // El estado observado manda. Nunca convertimos una serie terminada/abandonada
  // en pendiente sólo porque falten notas históricas por temporada.
  if (
    normalized === 'terminada' ||
    normalized === 'abandonada' ||
    normalized === 'reveer' ||
    normalized === 'al dia'
  ) {
    return null;
  }

  if (normalized !== 'viendo' && normalized !== 'en pausa') return null;
  if (observedRatings.size === 0) return null;

  const lastRated = Math.max(...observedRatings.keys());
  const next = lastRated + 1;
  if (totalSeasons !== null && next > totalSeasons) return null;
  return next;
}

export function buildSeasonSkeleton(
  totalSeasons: number | null,
  observedRatings: ReadonlyMap<number, number>,
  seriesRating: number | null = null,
): MediaSeasonView[] {
  const lastObserved = observedRatings.size > 0 ? Math.max(...observedRatings.keys()) : 0;
  const count = Math.max(totalSeasons ?? 0, lastObserved);
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const seasonNumber = index + 1;
    const explicitRating = observedRatings.get(seasonNumber) ?? null;
    const unambiguousSingleSeasonRating =
      totalSeasons === 1 && seasonNumber === 1 ? seriesRating : null;

    return {
      seasonNumber,
      year: null,
      episodeCount: null,
      observedRating: explicitRating ?? unambiguousSingleSeasonRating,
      estimatedAffinity: null,
      cinephileValue: null,
      culturalPresence: null,
      scoreVersion: null,
      evidenceState: 'unavailable' as const,
    };
  });
}

export function nextSeasonFor(item: MediaTitleView): MediaSeasonView | null {
  if (item.medium !== 'series' || item.nextSeasonNumber === null) return null;
  return item.seasonDetails.find((season) => season.seasonNumber === item.nextSeasonNumber) ?? null;
}

/** Misma semántica 50/30/20 que la serie completa, pero con señales de temporada. */
export function seasonWatchPriorityScore(season: MediaSeasonView | null): number | null {
  if (!season) return null;
  let weighted = 0;
  let weight = 0;

  if (season.estimatedAffinity !== null) {
    weighted += season.estimatedAffinity * 0.5;
    weight += 0.5;
  }
  if (season.cinephileValue !== null) {
    weighted += season.cinephileValue * 0.3;
    weight += 0.3;
  }
  if (season.culturalPresence !== null) {
    weighted += season.culturalPresence * 0.2;
    weight += 0.2;
  }

  if (weight === 0) return null;
  return Math.min(10, Math.max(0, weighted / weight));
}

export function clampSeasonAffinity(
  seriesAffinity: number | null,
  adjustment: number | null,
): number | null {
  if (seriesAffinity === null || adjustment === null) return null;
  return Math.min(10, Math.max(0, seriesAffinity + adjustment));
}
