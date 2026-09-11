import type { MediaKind, MediaTitleView } from '@/types/media';

export type MediaFocusLevel = 1 | 2 | 3;

const FOCUS_LIMITS: Record<MediaKind, Record<MediaFocusLevel, number>> = {
  movie: { 1: 10, 2: 50, 3: 100 },
  series: { 1: 5, 2: 20, 3: 40 },
};

function normalize(value: string | null): string {
  return (value ?? '').trim().toLocaleLowerCase('es-AR');
}

function tierBonus(tier: string | null): number {
  const normalized = normalize(tier).toUpperCase();
  if (normalized === 'A') return 0.3;
  if (normalized === 'B') return 0.15;
  return 0;
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

/**
 * Preferencia personal declarada para películas, no una valoración histórica.
 * 1990+ queda neutro. Hacia atrás resta 0,0125 por año hasta un máximo de -0,5.
 * Series quedan fuera de este ajuste hasta contar con evidencia específica.
 */
export function eraPreferenceAdjustment(medium: MediaKind, year: number | null): number {
  if (medium !== 'movie' || year === null || year >= 1990) return 0;
  return -Math.min(0.5, (1990 - year) * 0.0125);
}

export function adjustEstimatedAffinity(
  medium: MediaKind,
  year: number | null,
  affinity: number | null,
): number | null {
  if (affinity === null) return null;
  const adjusted = affinity + eraPreferenceAdjustment(medium, year);
  return Math.min(10, Math.max(0, adjusted));
}

function focusPriorityScore(item: MediaTitleView): number {
  let weighted = 0;
  let weight = 0;

  if (item.estimatedAffinity !== null) {
    weighted += item.estimatedAffinity * 0.55;
    weight += 0.55;
  }
  if (item.cinephileValue !== null) {
    weighted += item.cinephileValue * 0.25;
    weight += 0.25;
  }
  if (item.culturalImpact !== null) {
    weighted += item.culturalImpact * 0.2;
    weight += 0.2;
  }

  const base = weight > 0 ? weighted / weight : 0;
  return base + (item.radar ? 0.45 : 0) + tierBonus(item.bankTier);
}

function compareFocusBase(left: MediaTitleView, right: MediaTitleView): number {
  return (
    focusPriorityScore(right) - focusPriorityScore(left) ||
    Number(right.radar) - Number(left.radar) ||
    tierBonus(right.bankTier) - tierBonus(left.bankTier) ||
    (right.year ?? -Infinity) - (left.year ?? -Infinity) ||
    left.title.localeCompare(right.title, 'es')
  );
}

function primaryGenre(item: MediaTitleView): string {
  return normalize(item.genres[0] ?? null);
}

/**
 * Agrega diversidad suave sin cambiar el universo elegible.
 * El ranking determinístico se calcula una sola vez y luego se corta por nivel,
 * por lo que Foco 1 ⊂ Foco 2 ⊂ Foco 3.
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
