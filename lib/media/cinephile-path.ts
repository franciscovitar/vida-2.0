import type { MediaKind, MediaTitleView } from '@/types/media';

export const CINEPHILE_PATH_VERSION = 'cinephile-path-v1';

const FOUNDATION_WEIGHT = 0.75;
const ERA_WEIGHT = 0.15;
const GENRE_WEIGHT = 0.1;
const GLOBAL_MOVIE_WEIGHT = 0.65;
const GLOBAL_SERIES_WEIGHT = 0.35;
const FOUNDATIONAL_THRESHOLD = 6.5;

const FOUNDATION_TARGET: Record<MediaKind, number> = {
  movie: 360,
  series: 120,
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
  breakdown: CinephilePathBreakdown;
}

export interface CinephilePathGain {
  mediumGain: number;
  globalGain: number;
  importance: number | null;
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
  reason: string;
}

export interface CinephilePathSnapshot {
  version: typeof CINEPHILE_PATH_VERSION;
  movie: CinephilePathProgress;
  series: CinephilePathProgress;
  global: CinephilePathProgress;
  gainsByKey: ReadonlyMap<string, CinephilePathGain>;
  recommendations: Record<MediaKind, CinephilePathRecommendation[]>;
}

interface MediumPathState {
  kind: MediaKind;
  foundationXp: number;
  eras: Set<string>;
  genres: Set<string>;
  observedWorks: number;
  progress: CinephilePathProgress;
}

interface LevelDefinition {
  minimum: number;
  label: string;
}

const LEVELS: LevelDefinition[] = [
  { minimum: 100, label: 'Cinéfilo amateur muy formado' },
  { minimum: 85, label: 'Cultura audiovisual amplia' },
  { minimum: 65, label: 'Cinéfilo sólido' },
  { minimum: 45, label: 'Cinéfilo en formación' },
  { minimum: 25, label: 'Explorador con mapa' },
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
  const dimensions = [
    item.cinephileValue === null ? null : { value: item.cinephileValue, weight: 0.6 },
    item.culturalImpact === null ? null : { value: item.culturalImpact, weight: 0.4 },
  ].filter((entry): entry is { value: number; weight: number } => entry !== null);

  if (dimensions.length === 0) return null;
  const totalWeight = dimensions.reduce((sum, entry) => sum + entry.weight, 0);
  const weighted = dimensions.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  return weighted / totalWeight;
}

/**
 * XP is deliberately non-linear: an important work contributes much more than
 * a marginal one, while almost every scored work still adds a small amount.
 * The fixed targets define an amateur cultural milestone rather than the sum
 * of the whole catalog, so adding new titles can never make progress go back.
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

function progressFromParts(
  kind: MediaKind,
  foundationXp: number,
  eras: ReadonlySet<string>,
  genres: ReadonlySet<string>,
  observedWorks: number,
): CinephilePathProgress {
  const foundations = clamp((foundationXp / FOUNDATION_TARGET[kind]) * 100, 0, 100);
  const eraProgress = clamp((eras.size / ERA_TARGET[kind]) * 100, 0, 100);
  const genreProgress = clamp((genres.size / GENRE_TARGET[kind]) * 100, 0, 100);
  const percent = clamp(
    foundations * FOUNDATION_WEIGHT + eraProgress * ERA_WEIGHT + genreProgress * GENRE_WEIGHT,
    0,
    100,
  );
  const level = levelFor(percent);
  return {
    kind,
    percent: roundOne(percent),
    level: level.level,
    nextLevel: level.nextLevel,
    observedWorks,
    breakdown: {
      foundations: roundOne(foundations),
      eras: roundOne(eraProgress),
      genres: roundOne(genreProgress),
    },
  };
}

function buildMediumState(titles: readonly MediaTitleView[], kind: MediaKind): MediumPathState {
  const eras = new Set<string>();
  const genres = new Set<string>();
  let foundationXp = 0;
  let observedWorks = 0;

  for (const item of titles) {
    if (item.medium !== kind) continue;
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

  return {
    kind,
    foundationXp,
    eras,
    genres,
    observedWorks,
    progress: progressFromParts(kind, foundationXp, eras, genres, observedWorks),
  };
}

function globalProgress(
  movie: CinephilePathProgress,
  series: CinephilePathProgress,
): CinephilePathProgress {
  const percent = movie.percent * GLOBAL_MOVIE_WEIGHT + series.percent * GLOBAL_SERIES_WEIGHT;
  const foundations =
    movie.breakdown.foundations * GLOBAL_MOVIE_WEIGHT +
    series.breakdown.foundations * GLOBAL_SERIES_WEIGHT;
  const eras =
    movie.breakdown.eras * GLOBAL_MOVIE_WEIGHT + series.breakdown.eras * GLOBAL_SERIES_WEIGHT;
  const genres =
    movie.breakdown.genres * GLOBAL_MOVIE_WEIGHT + series.breakdown.genres * GLOBAL_SERIES_WEIGHT;
  const level = levelFor(percent);
  return {
    kind: 'global',
    percent: roundOne(percent),
    level: level.level,
    nextLevel: level.nextLevel,
    observedWorks: movie.observedWorks + series.observedWorks,
    breakdown: {
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
  const importance = cinephileImportance(item);
  if (importance !== null && importance >= FOUNDATIONAL_THRESHOLD) {
    const era = eraKey(item);
    if (era) nextEras.add(era);
    for (const genre of item.genres) {
      const normalized = normalizeText(genre);
      if (normalized) nextGenres.add(normalized);
    }
  }

  return progressFromParts(
    state.kind,
    state.foundationXp + cinephileFoundationXp(item) * (1 - currentExposure),
    nextEras,
    nextGenres,
    state.observedWorks + (currentExposure <= 0 ? 1 : 0),
  );
}

function gainReason(state: MediumPathState, item: MediaTitleView): string {
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

function recommendationFor(
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
  const gain: CinephilePathGain = {
    mediumGain: roundOne(Math.max(0, nextMedium.percent - state.progress.percent)),
    globalGain: roundOne(Math.max(0, nextGlobal.percent - currentGlobal.percent)),
    importance:
      cinephileImportance(item) === null ? null : roundOne(cinephileImportance(item) ?? 0),
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
      reason,
    },
  };
}

function isBankCandidate(item: MediaTitleView): boolean {
  return normalizeText(item.state) === 'por ver';
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
    const computed = recommendationFor(state, otherState, item);
    gainsByKey.set(item.key, computed.gain);
    if (computed.gain.mediumGain > 0 || computed.gain.globalGain > 0) {
      candidates[item.medium].push(computed.recommendation);
    }
  }

  for (const kind of ['movie', 'series'] as const) {
    candidates[kind].sort((a, b) => {
      if (b.globalGain !== a.globalGain) return b.globalGain - a.globalGain;
      if ((b.importance ?? -1) !== (a.importance ?? -1)) {
        return (b.importance ?? -1) - (a.importance ?? -1);
      }
      return a.title.localeCompare(b.title, 'es-AR');
    });
    candidates[kind] = candidates[kind].slice(0, 4);
  }

  return {
    version: CINEPHILE_PATH_VERSION,
    movie: movieState.progress,
    series: seriesState.progress,
    global: globalProgress(movieState.progress, seriesState.progress),
    gainsByKey,
    recommendations: candidates,
  };
}
