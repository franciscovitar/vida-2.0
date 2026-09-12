import type { MediaFocusLevel, MediaKind, MediaTitleView } from '@/types/media';

const FOCUS_LIMITS: Record<MediaKind, Record<MediaFocusLevel, number>> = {
  movie: { 1: 10, 2: 50, 3: 100 },
  series: { 1: 5, 2: 20, 3: 40 },
};

const FOCUS_LEVELS: MediaFocusLevel[] = [1, 2, 3];

function normalize(value: string | null): string {
  return (value ?? '').trim().toLocaleLowerCase('es-AR');
}

function tierRank(tier: string | null): number {
  const normalized = normalize(tier).toUpperCase();
  if (normalized === 'A') return 0;
  if (normalized === 'B') return 1;
  if (normalized === 'C') return 2;
  if (normalized === 'D') return 3;
  return 4;
}

function autoEligible(item: MediaTitleView, medium: MediaKind): boolean {
  if (item.medium !== medium || item.state !== 'Por ver') return false;
  if (medium === 'series') return true;

  return (
    normalize(item.pool) === 'operativo' &&
    (normalize(item.bankTier).toUpperCase() === 'A' ||
      normalize(item.bankTier).toUpperCase() === 'B')
  );
}

/**
 * Una prioridad manual siempre vuelve elegible un título `Por ver`, incluso si
 * la película está fuera del Pool operativo automático. La decisión humana no
 * altera Estado, Tier, Pool ni ninguna otra dimensión canónica.
 */
export function isFocusCandidate(item: MediaTitleView, medium: MediaKind): boolean {
  if (item.medium !== medium || item.state !== 'Por ver') return false;
  if (item.manualFocusLevel !== null) return true;
  return autoEligible(item, medium);
}

export function deriveFocusCandidates(
  titles: MediaTitleView[],
  medium: MediaKind,
): MediaTitleView[] {
  return titles.filter((item) => isFocusCandidate(item, medium));
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

/**
 * Nota derivada de 0 a 10 que responde "¿qué tan prioritaria es verla?".
 * No se persiste: se recalcula desde las tres dimensiones disponibles.
 * Cuando falta una dimensión, las ponderaciones restantes se renormalizan.
 */
export function watchPriorityScore(item: MediaTitleView): number | null {
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

  if (weight === 0) return null;
  return Math.min(10, Math.max(0, weighted / weight));
}

function compareNullablePriority(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

/**
 * Radar/Tier no alteran la nota global: sólo desempatan dos títulos con la
 * misma Prioridad de visionado. Así la métrica sigue siendo interpretable.
 */
export function compareFocusPriority(left: MediaTitleView, right: MediaTitleView): number {
  return (
    compareNullablePriority(watchPriorityScore(left), watchPriorityScore(right)) ||
    Number(right.radar) - Number(left.radar) ||
    tierRank(left.bankTier) - tierRank(right.bankTier) ||
    (right.year ?? -Infinity) - (left.year ?? -Infinity) ||
    left.title.localeCompare(right.title, 'es')
  );
}

export function focusLimit(medium: MediaKind, level: MediaFocusLevel): number {
  return FOCUS_LIMITS[medium][level];
}

function manualApplies(item: MediaTitleView, level: MediaFocusLevel): boolean {
  return item.manualFocusLevel !== null && item.manualFocusLevel <= level;
}

/**
 * Construye niveles anidados. Sin overrides manuales son prefijos exactos del
 * ranking (top 10/50/100 o 5/20/40). Un override manual entra en el nivel
 * elegido y todos los superiores; si hubiera más overrides que el cupo base,
 * se conservan todos en vez de descartar una decisión explícita del usuario.
 */
function buildFocusLevels(
  titles: MediaTitleView[],
  medium: MediaKind,
): Map<MediaFocusLevel, MediaTitleView[]> {
  const ranked = deriveFocusCandidates(titles, medium).sort(compareFocusPriority);
  const levels = new Map<MediaFocusLevel, MediaTitleView[]>();
  const selected = new Set<string>();
  let previous: MediaTitleView[] = [];

  for (const level of FOCUS_LEVELS) {
    const current = [...previous];

    for (const item of ranked) {
      if (!selected.has(item.key) && manualApplies(item, level)) {
        current.push(item);
        selected.add(item.key);
      }
    }

    const limit = focusLimit(medium, level);
    for (const item of ranked) {
      if (current.length >= limit) break;
      if (selected.has(item.key)) continue;
      current.push(item);
      selected.add(item.key);
    }

    current.sort(compareFocusPriority);
    levels.set(level, current);
    previous = current;
  }

  return levels;
}

export function deriveFocusTitles(
  titles: MediaTitleView[],
  medium: MediaKind,
  level: MediaFocusLevel,
): MediaTitleView[] {
  return buildFocusLevels(titles, medium).get(level) ?? [];
}
