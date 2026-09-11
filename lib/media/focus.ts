import type { MediaKind, MediaTitleView } from '@/types/media';

export type MediaFocusLevel = 1 | 2 | 3;

const FOCUS_LIMITS: Record<MediaKind, Record<MediaFocusLevel, number>> = {
  movie: { 1: 6, 2: 18, 3: 40 },
  series: { 1: 3, 2: 8, 3: 16 },
};

function normalize(value: string | null): string {
  return (value ?? '').trim().toLocaleLowerCase('es-AR');
}

function nullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function tierRank(tier: string | null): number {
  const normalized = normalize(tier).toUpperCase();
  if (normalized === 'A') return 0;
  if (normalized === 'B') return 1;
  return 2;
}

function isFocusEligible(item: MediaTitleView, medium: MediaKind): boolean {
  if (item.medium !== medium || item.state !== 'Por ver') return false;
  if (medium === 'series') return true;

  return (
    normalize(item.pool) === 'operativo' &&
    (normalize(item.bankTier).toUpperCase() === 'A' ||
      normalize(item.bankTier).toUpperCase() === 'B')
  );
}

function compareFocusBase(left: MediaTitleView, right: MediaTitleView): number {
  return (
    Number(right.radar) - Number(left.radar) ||
    tierRank(left.bankTier) - tierRank(right.bankTier) ||
    nullableDesc(left.cinephileValue, right.cinephileValue) ||
    nullableDesc(left.culturalImpact, right.culturalImpact) ||
    nullableDesc(left.year, right.year) ||
    left.title.localeCompare(right.title, 'es')
  );
}

function primaryGenre(item: MediaTitleView): string {
  return normalize(item.genres[0] ?? null);
}

/**
 * Adds a light diversity penalty without replacing the certified bank/external ranking.
 * The same deterministic ranking is sliced for every focus level, so levels are nested.
 */
function diversify(ranked: MediaTitleView[]): MediaTitleView[] {
  const remaining = ranked.map((item, baseIndex) => ({ item, baseIndex }));
  const creatorUse = new Map<string, number>();
  const genreUse = new Map<string, number>();
  const output: MediaTitleView[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;

    remaining.forEach((entry, index) => {
      const creator = normalize(entry.item.creator);
      const genre = primaryGenre(entry.item);
      const creatorPenalty = creator ? (creatorUse.get(creator) ?? 0) * 6 : 0;
      const genrePenalty = genre ? (genreUse.get(genre) ?? 0) * 3 : 0;
      const cost = entry.baseIndex + creatorPenalty + genrePenalty;

      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    });

    const selected = remaining.splice(bestIndex, 1)[0];
    if (!selected) break;

    const { item } = selected;
    output.push(item);

    const creator = normalize(item.creator);
    const genre = primaryGenre(item);
    if (creator) creatorUse.set(creator, (creatorUse.get(creator) ?? 0) + 1);
    if (genre) genreUse.set(genre, (genreUse.get(genre) ?? 0) + 1);
  }

  return output;
}

export function focusLimit(medium: MediaKind, level: MediaFocusLevel): number {
  return FOCUS_LIMITS[medium][level];
}

export function deriveFocusTitles(
  titles: MediaTitleView[],
  medium: MediaKind,
  level: MediaFocusLevel,
): MediaTitleView[] {
  const ranked = titles.filter((item) => isFocusEligible(item, medium)).sort(compareFocusBase);
  return diversify(ranked).slice(0, focusLimit(medium, level));
}
