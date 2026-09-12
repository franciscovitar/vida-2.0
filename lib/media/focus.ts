import { ageFeelAffinityAdjustment } from '@/lib/media/age-feel';
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
 * Una prioridad manual vuelve elegible un título `Por ver`; una exclusión
 * manual hace exactamente lo contrario y siempre gana sobre el ranking.
 */
export function isFocusCandidate(item: MediaTitleView, medium: MediaKind): boolean {
  if (item.medium !== medium || item.state !== 'Por ver') return false;
  if (item.manualFocusExcluded) return false;
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
 * Capa de preferencia explícita sobre Personal Fit v1.2. El modelo privado se
 * mantiene intacto y trazable; Vida aplica sólo la señal derivada de cuánto se
 * siente de época la película. Series permanecen neutrales por ahora.
 */
export function adjustEstimatedAffinity(
  medium: MediaKind,
  ageFeelScore: number | null,
  affinity: number | null,
): number | null {
  if (affinity === null) return null;
  const adjustment = medium === 'movie' ? ageFeelAffinityAdjustment(ageFeelScore) : 0;
  return Math.min(10, Math.max(0, affinity + adjustment));
}

/**
 * Nota derivada de 0 a 10 que responde "¿qué tan prioritaria es verla?".
 * Separa la afinidad personal de la importancia cinéfila/cultural y sigue la
 * fórmula canónica PAS 50/30/20. No se persiste; si falta una dimensión, las
 * ponderaciones restantes se renormalizan.
 */
export function watchPriorityScore(item: MediaTitleView): number | null {
  let weighted = 0;
  let weight = 0;

  if (item.estimatedAffinity !== null) {
    weighted += item.estimatedAffinity * 0.5;
    weight += 0.5;
  }
  if (item.cinephileValue !== null) {
    weighted += item.cinephileValue * 0.3;
    weight += 0.3;
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
 * Radar/Tier no alteran la nota visible: sólo desempatan dos títulos con la
 * misma Prioridad de visionado. La afinidad privada normalmente aporta precisión
 * sub-decimal, por lo que la UI puede mostrar dos decimales sin inventarlos.
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
 * ranking. Un override aparece desde el nivel elegido; una exclusión nunca entra.
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
      if (item.manualFocusLevel !== null && item.manualFocusLevel > level) continue;
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
