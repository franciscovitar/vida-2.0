import { compareFocusPriority, watchPriorityScore } from '@/lib/media/focus';
import type {
  MediaCollectionFilter,
  MediaCommitmentFilter,
  MediaFilters,
  MediaKind,
  MediaSort,
  MediaTitleView,
} from '@/types/media';

export interface MediaFilterOptions {
  genres: string[];
  countries: string[];
  creators: string[];
  years: number[];
  hasAffinity: boolean;
  hasEstimatedAffinity: boolean;
  hasCinephile: boolean;
  hasCultural: boolean;
  hasScores: boolean;
  hasWatchPriority: boolean;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .trim();
}

function isBank(item: MediaTitleView): boolean {
  return item.state === 'Por ver';
}

function isSeen(item: MediaTitleView): boolean {
  return item.medium === 'movie'
    ? item.state === 'Vista' || item.state === 'Reveer'
    : item.state === 'Terminada';
}

function isActive(item: MediaTitleView): boolean {
  return item.medium === 'series' && (item.state === 'Viendo' || item.state === 'En pausa');
}

export function matchesCollection(
  item: MediaTitleView,
  collection: MediaCollectionFilter,
): boolean {
  if (collection === 'all') return true;
  if (collection === 'bank') return isBank(item);
  if (collection === 'radar') return item.radar;
  if (collection === 'seen') return isSeen(item);
  return isActive(item);
}

function matchesCommitment(item: MediaTitleView, commitment: MediaCommitmentFilter): boolean {
  if (commitment === 'all') return true;

  if (item.medium === 'movie') {
    const runtime = item.runtimeMinutes;
    if (runtime === null) return false;
    if (commitment === 'under-90') return runtime < 90;
    if (commitment === '90-119') return runtime >= 90 && runtime < 120;
    if (commitment === '120-149') return runtime >= 120 && runtime < 150;
    if (commitment === '150-plus') return runtime >= 150;
    return false;
  }

  const seasons = item.seasons;
  if (seasons === null) return false;
  if (commitment === 'one-season') return seasons === 1;
  if (commitment === 'two-three-seasons') return seasons >= 2 && seasons <= 3;
  if (commitment === 'four-plus-seasons') return seasons >= 4;
  return false;
}

function matchesYearRange(item: MediaTitleView, yearFrom: string, yearTo: string): boolean {
  if (!yearFrom && !yearTo) return true;
  if (item.year === null) return false;
  if (yearFrom && item.year < Number(yearFrom)) return false;
  if (yearTo && item.year > Number(yearTo)) return false;
  return true;
}

function matchesQuery(item: MediaTitleView, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = [
    item.title,
    item.originalTitle ?? '',
    item.creator ?? '',
    ...item.genres,
    ...item.countries,
  ]
    .map(normalize)
    .join(' ');
  return haystack.includes(needle);
}

function exactNormalized(value: string | null, expected: string): boolean {
  return value !== null && normalize(value) === normalize(expected);
}

export function filterMediaTitles(
  titles: MediaTitleView[],
  filters: MediaFilters,
): MediaTitleView[] {
  return titles.filter((item) => {
    if (item.medium !== filters.medium) return false;
    if (!matchesCollection(item, filters.collection)) return false;
    if (!matchesQuery(item, filters.query)) return false;
    if (filters.genre && !item.genres.some((genre) => exactNormalized(genre, filters.genre))) {
      return false;
    }
    if (
      filters.country &&
      !item.countries.some((country) => exactNormalized(country, filters.country))
    ) {
      return false;
    }
    if (filters.creator && !exactNormalized(item.creator, filters.creator)) return false;
    if (!matchesYearRange(item, filters.yearFrom, filters.yearTo)) return false;
    return matchesCommitment(item, filters.commitment);
  });
}

function nullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function tierRank(tier: string | null): number {
  if (tier === 'A') return 0;
  if (tier === 'B') return 1;
  if (tier === 'C') return 2;
  if (tier === 'D') return 3;
  return 4;
}

export function sortMediaTitles(titles: MediaTitleView[], sort: MediaSort): MediaTitleView[] {
  if (sort === 'focus-priority') return [...titles].sort(compareFocusPriority);

  return [...titles].sort((left, right) => {
    if (sort === 'rating-desc') {
      return nullableDesc(left.rating, right.rating) || left.title.localeCompare(right.title, 'es');
    }
    if (sort === 'affinity-desc') {
      return (
        nullableDesc(left.affinity, right.affinity) || left.title.localeCompare(right.title, 'es')
      );
    }
    if (sort === 'estimated-affinity-desc') {
      return (
        nullableDesc(left.estimatedAffinity, right.estimatedAffinity) ||
        left.title.localeCompare(right.title, 'es')
      );
    }
    if (sort === 'cinephile-desc') {
      return (
        nullableDesc(left.cinephileValue, right.cinephileValue) ||
        left.title.localeCompare(right.title, 'es')
      );
    }
    if (sort === 'cultural-desc') {
      return (
        nullableDesc(left.culturalImpact, right.culturalImpact) ||
        left.title.localeCompare(right.title, 'es')
      );
    }
    if (sort === 'year-desc') {
      return nullableDesc(left.year, right.year) || left.title.localeCompare(right.title, 'es');
    }
    if (sort === 'title') return left.title.localeCompare(right.title, 'es');
    if (sort === 'score-desc') {
      return (
        nullableDesc(left.generalScore, right.generalScore) ||
        left.title.localeCompare(right.title, 'es')
      );
    }

    return (
      Number(right.radar) - Number(left.radar) ||
      tierRank(left.bankTier) - tierRank(right.bankTier) ||
      nullableDesc(left.year, right.year) ||
      left.title.localeCompare(right.title, 'es')
    );
  });
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'es'),
  );
}

export function deriveMediaFilterOptions(
  titles: MediaTitleView[],
  medium: MediaKind,
): MediaFilterOptions {
  const scoped = titles.filter((item) => item.medium === medium);
  const years = [
    ...new Set(scoped.flatMap((item) => (item.year === null ? [] : [item.year]))),
  ].sort((left, right) => right - left);

  return {
    genres: uniqueSorted(scoped.flatMap((item) => item.genres)),
    countries: uniqueSorted(scoped.flatMap((item) => item.countries)),
    creators: uniqueSorted(scoped.map((item) => item.creator ?? '')),
    years,
    hasAffinity: scoped.some((item) => item.affinity !== null),
    hasEstimatedAffinity: scoped.some((item) => item.estimatedAffinity !== null),
    hasCinephile: scoped.some((item) => item.cinephileValue !== null),
    hasCultural: scoped.some((item) => item.culturalImpact !== null),
    hasScores: scoped.some((item) => item.generalScore !== null),
    hasWatchPriority: scoped.some((item) => watchPriorityScore(item) !== null),
  };
}

export function countCollection(
  titles: MediaTitleView[],
  medium: MediaKind,
  collection: MediaCollectionFilter,
): number {
  return titles.filter((item) => item.medium === medium && matchesCollection(item, collection))
    .length;
}
