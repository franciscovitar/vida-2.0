import {
  CINEPHILE_CANON_AS_OF,
  CINEPHILE_CANON_VERSION,
  canonEntryMatchesItem,
  cinephileObligationFor,
  externalCanonEntries,
  externalCanonEntryFor,
  externalCanonTotalWeight,
  mediaCulturalImportance,
  obligationRank,
  type CinephileCanonEntry,
} from '@/lib/media/cinephile-canon';
import type { MediaCulturalObligation, MediaKind, MediaTitleView } from '@/types/media';

export const CINEPHILE_PATH_VERSION = 'cinephile-path-v2';

const EXTERNAL_CANON_WEIGHT = 0.7;
const FOUNDATION_WEIGHT = 0.15;
const ERA_WEIGHT = 0.1;
const GENRE_WEIGHT = 0.05;
const GLOBAL_MOVIE_WEIGHT = 0.65;
const GLOBAL_SERIES_WEIGHT = 0.35;
const FOUNDATIONAL_THRESHOLD = 6.5;
const COMPLETE_CORE_CAP = 99.4;

const CANON_TARGET_RATIO: Record<MediaKind, number> = {
  movie: 0.6,
  series: 0.65,
};

const FOUNDATION_TARGET: Record<MediaKind, number> = {
  movie: 420,
  series: 150,
};

const ERA_TARGET: Record<MediaKind, number> = {
  movie: 8,
  series: 5,
};

const GENRE_TARGET: Record<MediaKind, number> = {
  movie: 10,
  series: 8,
};

export type CinephilePathKind = MediaKind | 'global';

export interface CinephilePathBreakdown {
  externalCanon: number;
  foundations: number;
  eras: number;
  genres: number;
}

export interface CinephilePathProgress {
  kind: CinephilePathKind;
  percent: number;
  level: string;
  nextLevel: string | null;
  observedWorks: number;
  coreCovered: number;
  coreTotal: number;
  referenceCovered: number;
  referenceTotal: number;
  breakdown: CinephilePathBreakdown;
}

export interface CinephilePathGain {
  mediumGain: number;
  globalGain: number;
  importance: number | null;
  obligation: MediaCulturalObligation;
  reason: string;
}

export interface CinephilePathRecommendation {
  key: string;
  title: string;
  year: number | null;
  medium: MediaKind;
  posterPath: string | null;
  mediumGain: number;
  globalGain: number;
  importance: number | null;
  obligation: MediaCulturalObligation;
  inMedia: boolean;
  reason: string;
}

export interface CinephilePathSnapshot {
  version: typeof CINEPHILE_PATH_VERSION;
  canonVersion: typeof CINEPHILE_CANON_VERSION;
  canonAsOf: typeof CINEPHILE_CANON_AS_OF;
  movie: CinephilePathProgress;
  series: CinephilePathProgress;
  global: CinephilePathProgress;
  gainsByKey: ReadonlyMap<string, CinephilePathGain>;
  recommendations: Record<MediaKind, CinephilePathRecommendation[]>;
}

interface MediumPathState {
  kind: MediaKind;
  titles: readonly MediaTitleView[];
  foundationXp: number;
  eras: Set<string>;
  genres: Set<string>;
  observedWorks: number;
  canonExposure: Map<string, number>;
  canonPoints: number;
  progress: CinephilePathProgress;
}

interface LevelDefinition {
  minimum: number;
  label: string;
}

const LEVELS: LevelDefinition[] = [
  { minimum: 100, label: 'Cinéfilo amateur de referencia' },
  { minimum: 95, label: 'Cinéfilo amateur muy formado' },
  { minimum: 88, label: 'Cinéfilo avanzado' },
  { minimum: 78, label: 'Cultura audiovisual amplia' },
  { minimum: 65, label: 'Cinéfilo sólido' },
  { minimum: 50, label: 'Cinéfilo en formación' },
  { minimum: 35, label: 'Explorador con mapa' },
  { minimum: 20, label: 'Espectador curioso' },
  { minimum: 0, label: 'Explorador' },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('es-AR');
}

export function cinephileImportance(item: MediaTitleView): number | null {
  return mediaCulturalImportance(item);
}

/**
 * Secondary cultural XP for works already present in Media. The external canon
 * is the dominant benchmark in v2; this score keeps room for new or important
 * works that have not yet stabilized in long-running canon lists.
 */
export function cinephileFoundationXp(item: MediaTitleView): number {
  const importance = cinephileImportance(item);
  if (importance === null) return 0.08;
  const normalized = clamp((importance - 5.5) / 4.5, 0, 1);
  return 0.12 + 1.88 * normalized ** 2.15;
}

function seriesExposure(item: MediaTitleView): number {
  const state = normalizeText(item.state);
  if (state === 'terminada' || state === 'al día' || state === 'al dia' || state === 'reveer') {
    return 1;
  }

  const totalSeasons = Math.max(item.seasons ?? item.seasonDetails.length, 0);
  const ratedSeasons = item.seasonDetails.filter((season) => season.observedRating !== null).length;
  const observedShare = totalSeasons > 0 ? ratedSeasons / totalSeasons : 0;

  if (state === 'viendo' || state === 'en pausa') {
    return clamp(observedShare > 0 ? observedShare : 0.35, 0.35, 0.9);
  }
  if (state === 'abandonada' || state === 'abandonado') {
    return clamp(observedShare > 0 ? observedShare : 0.2, 0.2, 0.5);
  }
  return 0;
}

export function cinephileExposure(item: MediaTitleView): number {
  const state = normalizeText(item.state);
  if (item.medium === 'movie') {
    return state === 'vista' || state === 'visto' || state === 'reveer' ? 1 : 0;
  }
  return seriesExposure(item);
}

function eraKey(item: MediaTitleView): string | null {
  if (item.year === null) return null;
  if (item.medium === 'movie') {
    if (item.year < 1960) return 'pre-1960';
    if (item.year < 1970) return '1960s';
    if (item.year < 1980) return '1970s';
    if (item.year < 1990) return '1980s';
    if (item.year < 2000) return '1990s';
    if (item.year < 2010) return '2000s';
    if (item.year < 2020) return '2010s';
    return '2020s';
  }
  if (item.year < 1990) return 'pre-1990';
  if (item.year < 2000) return '1990s';
  if (item.year < 2010) return '2000s';
  if (item.year < 2020) return '2010s';
  return '2020s';
}

function levelFor(percent: number): { level: string; nextLevel: string | null } {
  const currentIndex = LEVELS.findIndex((definition) => percent >= definition.minimum);
  const current = LEVELS[currentIndex] ?? LEVELS[LEVELS.length - 1];
  const next = currentIndex <= 0 ? null : (LEVELS[currentIndex - 1]?.label ?? null);
  return { level: current.label, nextLevel: next };
}

function exposureForEntry(entry: CinephileCanonEntry, titles: readonly MediaTitleView[]): number {
  let exposure = 0;
  for (const item of titles) {
    if (!canonEntryMatchesItem(entry, item)) continue;
    exposure = Math.max(exposure, cinephileExposure(item));
  }
  return exposure;
}

function canonSummary(
  kind: MediaKind,
  canonExposure: ReadonlyMap<string, number>,
): {
  percent: number;
  points: number;
  coreCovered: number;
  coreTotal: number;
  referenceCovered: number;
  referenceTotal: number;
} {
  const entries = externalCanonEntries(kind);
  let points = 0;
  let coreCovered = 0;
  let coreTotal = 0;
  let referenceCovered = 0;

  for (const entry of entries) {
    const exposure = canonExposure.get(entry.id) ?? 0;
    points += entry.weight * exposure;
    if (exposure >= 1) referenceCovered += 1;
    if (entry.obligation === 'imprescindible') {
      coreTotal += 1;
      if (exposure >= 1) coreCovered += 1;
    }
  }

  const targetPoints = externalCanonTotalWeight(kind) * CANON_TARGET_RATIO[kind];
  return {
    percent: clamp((points / targetPoints) * 100, 0, 100),
    points,
    coreCovered,
    coreTotal,
    referenceCovered,
    referenceTotal: entries.length,
  };
}

function progressFromStateParts(
  kind: MediaKind,
  canonExposure: ReadonlyMap<string, number>,
  foundationXp: number,
  eras: ReadonlySet<string>,
  genres: ReadonlySet<string>,
  observedWorks: number,
): CinephilePathProgress {
  const canon = canonSummary(kind, canonExposure);
  const foundations = clamp((foundationXp / FOUNDATION_TARGET[kind]) * 100, 0, 100);
  const eraProgress = clamp((eras.size / ERA_TARGET[kind]) * 100, 0, 100);
  const genreProgress = clamp((genres.size / GENRE_TARGET[kind]) * 100, 0, 100);
  let percent = clamp(
    canon.percent * EXTERNAL_CANON_WEIGHT +
      foundations * FOUNDATION_WEIGHT +
      eraProgress * ERA_WEIGHT +
      genreProgress * GENRE_WEIGHT,
    0,
    100,
  );

  // 100% is intentionally strict: all externally designated imprescindibles
  // must be fully covered. Missing one does not erase prior progress, but it
  // keeps the final reference milestone visibly open.
  if (canon.coreCovered < canon.coreTotal) percent = Math.min(percent, COMPLETE_CORE_CAP);

  const rounded = roundOne(percent);
  const level = levelFor(rounded);
  return {
    kind,
    percent: rounded,
    level: level.level,
    nextLevel: level.nextLevel,
    observedWorks,
    coreCovered: canon.coreCovered,
    coreTotal: canon.coreTotal,
    referenceCovered: canon.referenceCovered,
    referenceTotal: canon.referenceTotal,
    breakdown: {
      externalCanon: roundOne(canon.percent),
      foundations: roundOne(foundations),
      eras: roundOne(eraProgress),
      genres: roundOne(genreProgress),
    },
  };
}

function buildMediumState(titles: readonly MediaTitleView[], kind: MediaKind): MediumPathState {
  const eras = new Set<string>();
  const genres = new Set<string>();
  const scopedTitles = titles.filter((item) => item.medium === kind);
  const canonExposure = new Map<string, number>();
  let foundationXp = 0;
  let observedWorks = 0;

  for (const entry of externalCanonEntries(kind)) {
    canonExposure.set(entry.id, exposureForEntry(entry, scopedTitles));
  }

  for (const item of scopedTitles) {
    const exposure = cinephileExposure(item);
    if (exposure <= 0) continue;
    observedWorks += 1;
    foundationXp += cinephileFoundationXp(item) * exposure;

    const importance = cinephileImportance(item);
    if (importance === null || importance < FOUNDATIONAL_THRESHOLD) continue;
    const era = eraKey(item);
    if (era) eras.add(era);
    for (const genre of item.genres) {
      const normalized = normalizeText(genre);
      if (normalized) genres.add(normalized);
    }
  }

  const canon = canonSummary(kind, canonExposure);
  return {
    kind,
    titles: scopedTitles,
    foundationXp,
    eras,
    genres,
    observedWorks,
    canonExposure,
    canonPoints: canon.points,
    progress: progressFromStateParts(
      kind,
      canonExposure,
      foundationXp,
      eras,
      genres,
      observedWorks,
    ),
  };
}

function globalProgress(
  movie: CinephilePathProgress,
  series: CinephilePathProgress,
): CinephilePathProgress {
  let percent = movie.percent * GLOBAL_MOVIE_WEIGHT + series.percent * GLOBAL_SERIES_WEIGHT;
  if (movie.coreCovered < movie.coreTotal || series.coreCovered < series.coreTotal) {
    percent = Math.min(percent, COMPLETE_CORE_CAP);
  }
  const externalCanon =
    movie.breakdown.externalCanon * GLOBAL_MOVIE_WEIGHT +
    series.breakdown.externalCanon * GLOBAL_SERIES_WEIGHT;
  const foundations =
    movie.breakdown.foundations * GLOBAL_MOVIE_WEIGHT +
    series.breakdown.foundations * GLOBAL_SERIES_WEIGHT;
  const eras =
    movie.breakdown.eras * GLOBAL_MOVIE_WEIGHT + series.breakdown.eras * GLOBAL_SERIES_WEIGHT;
  const genres =
    movie.breakdown.genres * GLOBAL_MOVIE_WEIGHT + series.breakdown.genres * GLOBAL_SERIES_WEIGHT;
  const rounded = roundOne(percent);
  const level = levelFor(rounded);
  return {
    kind: 'global',
    percent: rounded,
    level: level.level,
    nextLevel: level.nextLevel,
    observedWorks: movie.observedWorks + series.observedWorks,
    coreCovered: movie.coreCovered + series.coreCovered,
    coreTotal: movie.coreTotal + series.coreTotal,
    referenceCovered: movie.referenceCovered + series.referenceCovered,
    referenceTotal: movie.referenceTotal + series.referenceTotal,
    breakdown: {
      externalCanon: roundOne(externalCanon),
      foundations: roundOne(foundations),
      eras: roundOne(eras),
      genres: roundOne(genres),
    },
  };
}

function progressWithFullExposure(
  state: MediumPathState,
  item: MediaTitleView,
): CinephilePathProgress {
  const currentExposure = cinephileExposure(item);
  if (currentExposure >= 1) return state.progress;

  const nextEras = new Set(state.eras);
  const nextGenres = new Set(state.genres);
  const nextCanonExposure = new Map(state.canonExposure);
  const importance = cinephileImportance(item);

  if (importance !== null && importance >= FOUNDATIONAL_THRESHOLD) {
    const era = eraKey(item);
    if (era) nextEras.add(era);
    for (const genre of item.genres) {
      const normalized = normalizeText(genre);
      if (normalized) nextGenres.add(normalized);
    }
  }

  const canonEntry = externalCanonEntryFor(item);
  if (canonEntry) {
    const currentCanonExposure = nextCanonExposure.get(canonEntry.id) ?? 0;
    nextCanonExposure.set(canonEntry.id, Math.max(currentCanonExposure, 1));
  }

  return progressFromStateParts(
    state.kind,
    nextCanonExposure,
    state.foundationXp + cinephileFoundationXp(item) * (1 - currentExposure),
    nextEras,
    nextGenres,
    state.observedWorks + (currentExposure <= 0 ? 1 : 0),
  );
}

function progressWithCanonEntry(
  state: MediumPathState,
  entry: CinephileCanonEntry,
): CinephilePathProgress {
  const currentExposure = state.canonExposure.get(entry.id) ?? 0;
  if (currentExposure >= 1) return state.progress;
  const nextCanonExposure = new Map(state.canonExposure);
  nextCanonExposure.set(entry.id, 1);
  return progressFromStateParts(
    state.kind,
    nextCanonExposure,
    state.foundationXp,
    state.eras,
    state.genres,
    state.observedWorks,
  );
}

function gainReason(state: MediumPathState, item: MediaTitleView): string {
  const external = externalCanonEntryFor(item);
  if (external?.obligation === 'imprescindible') return 'Núcleo imprescindible del canon externo';
  if (external?.obligation === 'esencial') return 'Canon externo de alta prioridad';

  const importance = cinephileImportance(item);
  const era = eraKey(item);
  const opensEra = Boolean(era && !state.eras.has(era));
  const opensGenre = item.genres.some((genre) => {
    const normalized = normalizeText(genre);
    return normalized.length > 0 && !state.genres.has(normalized);
  });

  if ((importance ?? 0) >= 9 && opensEra) return 'Obra fundamental + nueva etapa histórica';
  if ((importance ?? 0) >= 9) return 'Obra fundamental para el mapa audiovisual';
  if (opensEra && opensGenre) return 'Amplía época y géneros';
  if (opensEra) return 'Amplía tu recorrido histórico';
  if (opensGenre) return 'Amplía tu diversidad de géneros';
  if ((importance ?? 0) >= 8) return 'Alta relevancia cultural/cinéfila';
  return 'Suma recorrido sin convertirlo en una obligación';
}

function recommendationForItem(
  state: MediumPathState,
  otherState: MediumPathState,
  item: MediaTitleView,
): { gain: CinephilePathGain; recommendation: CinephilePathRecommendation } {
  const nextMedium = progressWithFullExposure(state, item);
  const currentGlobal =
    state.kind === 'movie'
      ? globalProgress(state.progress, otherState.progress)
      : globalProgress(otherState.progress, state.progress);
  const nextGlobal =
    state.kind === 'movie'
      ? globalProgress(nextMedium, otherState.progress)
      : globalProgress(otherState.progress, nextMedium);
  const reason = gainReason(state, item);
  const obligation = cinephileObligationFor(item);
  const importance = cinephileImportance(item);
  const gain: CinephilePathGain = {
    mediumGain: roundOne(Math.max(0, nextMedium.percent - state.progress.percent)),
    globalGain: roundOne(Math.max(0, nextGlobal.percent - currentGlobal.percent)),
    importance: importance === null ? null : roundOne(importance),
    obligation,
    reason,
  };
  return {
    gain,
    recommendation: {
      key: item.key,
      title: item.title,
      year: item.year,
      medium: item.medium,
      posterPath: item.posterPath,
      mediumGain: gain.mediumGain,
      globalGain: gain.globalGain,
      importance: gain.importance,
      obligation,
      inMedia: true,
      reason,
    },
  };
}

function recommendationForCanonGap(
  state: MediumPathState,
  otherState: MediumPathState,
  entry: CinephileCanonEntry,
): CinephilePathRecommendation {
  const matchedItem = state.titles.find((item) => canonEntryMatchesItem(entry, item)) ?? null;
  const nextMedium = matchedItem
    ? progressWithFullExposure(state, matchedItem)
    : progressWithCanonEntry(state, entry);
  const currentGlobal =
    state.kind === 'movie'
      ? globalProgress(state.progress, otherState.progress)
      : globalProgress(otherState.progress, state.progress);
  const nextGlobal =
    state.kind === 'movie'
      ? globalProgress(nextMedium, otherState.progress)
      : globalProgress(otherState.progress, nextMedium);

  return {
    key: matchedItem?.key ?? `canon:${entry.id}`,
    title: matchedItem?.title ?? entry.title,
    year: matchedItem?.year ?? entry.year ?? null,
    medium: entry.medium,
    posterPath: matchedItem?.posterPath ?? null,
    mediumGain: roundOne(Math.max(0, nextMedium.percent - state.progress.percent)),
    globalGain: roundOne(Math.max(0, nextGlobal.percent - currentGlobal.percent)),
    importance:
      matchedItem && cinephileImportance(matchedItem) !== null
        ? roundOne(cinephileImportance(matchedItem) ?? 0)
        : null,
    obligation: entry.obligation,
    inMedia: matchedItem !== null,
    reason:
      entry.obligation === 'imprescindible'
        ? matchedItem
          ? 'Núcleo imprescindible del canon externo'
          : 'Núcleo imprescindible externo · todavía no figura en tu Media'
        : matchedItem
          ? 'Referencia externa todavía no cubierta'
          : 'Referencia externa · todavía no figura en tu Media',
  };
}

function isBankCandidate(item: MediaTitleView): boolean {
  return normalizeText(item.state) === 'por ver';
}

function recommendationSort(
  left: CinephilePathRecommendation,
  right: CinephilePathRecommendation,
): number {
  const obligationDelta = obligationRank(left.obligation) - obligationRank(right.obligation);
  if (obligationDelta !== 0) return obligationDelta;
  if (right.globalGain !== left.globalGain) return right.globalGain - left.globalGain;
  if ((right.importance ?? -1) !== (left.importance ?? -1)) {
    return (right.importance ?? -1) - (left.importance ?? -1);
  }
  return left.title.localeCompare(right.title, 'es-AR');
}

export function buildCinephilePath(titles: readonly MediaTitleView[]): CinephilePathSnapshot {
  const movieState = buildMediumState(titles, 'movie');
  const seriesState = buildMediumState(titles, 'series');
  const gainsByKey = new Map<string, CinephilePathGain>();
  const candidates: Record<MediaKind, CinephilePathRecommendation[]> = { movie: [], series: [] };

  for (const item of titles) {
    if (!isBankCandidate(item)) continue;
    const state = item.medium === 'movie' ? movieState : seriesState;
    const otherState = item.medium === 'movie' ? seriesState : movieState;
    const computed = recommendationForItem(state, otherState, item);
    gainsByKey.set(item.key, computed.gain);
    if (computed.gain.mediumGain > 0 || computed.gain.globalGain > 0) {
      candidates[item.medium].push(computed.recommendation);
    }
  }

  for (const [kind, state, otherState] of [
    ['movie', movieState, seriesState],
    ['series', seriesState, movieState],
  ] as const) {
    const existingKeys = new Set(candidates[kind].map((item) => item.key));
    for (const entry of externalCanonEntries(kind)) {
      if ((state.canonExposure.get(entry.id) ?? 0) >= 1) continue;
      const recommendation = recommendationForCanonGap(state, otherState, entry);
      if (existingKeys.has(recommendation.key)) continue;
      candidates[kind].push(recommendation);
      existingKeys.add(recommendation.key);
    }
    candidates[kind].sort(recommendationSort);
    candidates[kind] = candidates[kind].slice(0, 6);
  }

  return {
    version: CINEPHILE_PATH_VERSION,
    canonVersion: CINEPHILE_CANON_VERSION,
    canonAsOf: CINEPHILE_CANON_AS_OF,
    movie: movieState.progress,
    series: seriesState.progress,
    global: globalProgress(movieState.progress, seriesState.progress),
    gainsByKey,
    recommendations: candidates,
  };
}
