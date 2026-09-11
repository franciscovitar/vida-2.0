import type { MediaKind, MediaTitleView } from '@/types/media';

type FeatureFamily = 'genres' | 'creator' | 'decade' | 'countries' | 'runtime' | 'seasons';
type OrdinalLevel = 'low' | 'medium' | 'high' | 'uncertain';
type Pace = 'slow' | 'moderate' | 'fast' | 'variable';
type HorrorMode =
  'none' | 'psychological' | 'thematic' | 'supernatural' | 'slasher' | 'body_horror' | 'mixed';
type RomanceMode = 'none' | 'grounded' | 'heightened' | 'melodramatic' | 'comedic' | 'mixed';
type TwistStyle = 'none' | 'fair_setup' | 'ambiguity_driven' | 'reveal_driven' | 'uncertain';

export interface MediaExperienceProfile {
  character_focus: OrdinalLevel | null;
  character_complexity: OrdinalLevel | null;
  emotional_intensity: OrdinalLevel | null;
  pace: Pace | null;
  narrative_complexity: OrdinalLevel | null;
  ambiguity: OrdinalLevel | null;
  mystery_drive: OrdinalLevel | null;
  dialogue_emphasis: OrdinalLevel | null;
  multi_thread: boolean | null;
  moral_complexity: OrdinalLevel | null;
  strategy_politics: OrdinalLevel | null;
  dark_humor: OrdinalLevel | null;
  horror_mode: HorrorMode | null;
  romance_mode: RomanceMode | null;
  music_emphasis: OrdinalLevel | null;
  visual_emphasis: OrdinalLevel | null;
  twist_style: TwistStyle | null;
  internal_coherence: OrdinalLevel | null;
  originality_signal: OrdinalLevel | null;
  formula_risk: OrdinalLevel | null;
}

export interface PersonalFitScoringRow {
  view: MediaTitleView;
  experienceProfile: MediaExperienceProfile | null;
}

const MAX_NEIGHBORS = 12;
const MIN_NEIGHBOR_SIMILARITY = 0.2;
const MIN_NEIGHBOR_FAMILIES = 2;

const NEIGHBOR_WEIGHTS: Record<MediaKind, Record<FeatureFamily, number>> = {
  movie: { genres: 0.35, creator: 0.2, decade: 0.15, countries: 0.1, runtime: 0.1, seasons: 0 },
  series: {
    genres: 0.35,
    creator: 0.2,
    decade: 0.15,
    countries: 0.1,
    runtime: 0.1,
    seasons: 0.1,
  },
};

const PROFILE_WEIGHTS: Record<MediaKind, Record<FeatureFamily, number>> = {
  movie: { genres: 0.4, creator: 0.2, decade: 0.15, countries: 0.1, runtime: 0.1, seasons: 0 },
  series: {
    genres: 0.4,
    creator: 0.2,
    decade: 0.15,
    countries: 0.1,
    runtime: 0.1,
    seasons: 0.05,
  },
};

const SHRINKAGE_K: Record<FeatureFamily, number> = {
  genres: 6,
  creator: 4,
  decade: 8,
  countries: 8,
  runtime: 8,
  seasons: 8,
};

const ORDINAL_PROFILE_WEIGHTS = {
  character_focus: 0.2,
  character_complexity: 0.25,
  emotional_intensity: 0.15,
  narrative_complexity: 0.18,
  ambiguity: 0.1,
  mystery_drive: 0.12,
  dialogue_emphasis: 0.15,
  moral_complexity: 0.18,
  strategy_politics: 0.1,
  dark_humor: 0.05,
  music_emphasis: 0.05,
  visual_emphasis: 0.03,
  internal_coherence: 0.25,
  originality_signal: 0.22,
} as const;

type WeightedProfileKey = keyof typeof ORDINAL_PROFILE_WEIGHTS;

const ORDINAL_LEVELS = new Set<OrdinalLevel>(['low', 'medium', 'high', 'uncertain']);
const PACES = new Set<Pace>(['slow', 'moderate', 'fast', 'variable']);
const HORROR_MODES = new Set<HorrorMode>([
  'none',
  'psychological',
  'thematic',
  'supernatural',
  'slasher',
  'body_horror',
  'mixed',
]);
const ROMANCE_MODES = new Set<RomanceMode>([
  'none',
  'grounded',
  'heightened',
  'melodramatic',
  'comedic',
  'mixed',
]);
const TWIST_STYLES = new Set<TwistStyle>([
  'none',
  'fair_setup',
  'ambiguity_driven',
  'reveal_driven',
  'uncertain',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalize(value: string | null): string | null {
  const normalized = value?.normalize('NFKC').trim().toLocaleLowerCase('es-AR');
  return normalized || null;
}

function featureFamilies(medium: MediaKind): FeatureFamily[] {
  return medium === 'movie'
    ? ['genres', 'creator', 'decade', 'countries', 'runtime']
    : ['genres', 'creator', 'decade', 'countries', 'runtime', 'seasons'];
}

function decade(year: number | null): number | null {
  return year === null ? null : Math.floor(year / 10) * 10;
}

function runtimeBucket(value: number | null, medium: MediaKind): string | null {
  if (value === null) return null;
  if (medium === 'movie') {
    if (value < 90) return '<90';
    if (value < 120) return '90-119';
    if (value < 150) return '120-149';
    return '150+';
  }
  if (value < 30) return '<30';
  if (value < 45) return '30-44';
  if (value < 60) return '45-59';
  return '60+';
}

function seasonBucket(value: number | null): string | null {
  if (value === null) return null;
  if (value <= 1) return '1';
  if (value <= 3) return '2-3';
  if (value <= 6) return '4-6';
  return '7+';
}

function featureValues(item: MediaTitleView, family: FeatureFamily): string[] {
  if (family === 'genres')
    return item.genres.map((value) => normalize(value)).filter(Boolean) as string[];
  if (family === 'creator') {
    const value = normalize(item.creator);
    return value ? [value] : [];
  }
  if (family === 'decade') {
    const value = decade(item.year);
    return value === null ? [] : [String(value)];
  }
  if (family === 'countries') {
    return item.countries.map((value) => normalize(value)).filter(Boolean) as string[];
  }
  if (family === 'runtime') {
    const value = runtimeBucket(item.runtimeMinutes, item.medium);
    return value ? [value] : [];
  }
  const value = seasonBucket(item.seasons);
  return value ? [value] : [];
}

function jaccard(left: string[], right: string[]): number | null {
  if (left.length === 0 || right.length === 0) return null;
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? null : intersection / union;
}

function similarity(
  left: MediaTitleView,
  right: MediaTitleView,
): { score: number; familyCount: number } {
  if (left.medium !== right.medium) return { score: 0, familyCount: 0 };

  const components = new Map<FeatureFamily, number>();
  const genreSimilarity = jaccard(featureValues(left, 'genres'), featureValues(right, 'genres'));
  if (genreSimilarity !== null) components.set('genres', genreSimilarity);

  const leftCreator = normalize(left.creator);
  const rightCreator = normalize(right.creator);
  if (leftCreator && rightCreator) components.set('creator', leftCreator === rightCreator ? 1 : 0);

  const leftDecade = decade(left.year);
  const rightDecade = decade(right.year);
  if (leftDecade !== null && rightDecade !== null) {
    const delta = Math.abs(leftDecade - rightDecade);
    components.set('decade', delta === 0 ? 1 : delta === 10 ? 0.5 : 0);
  }

  const countrySimilarity = jaccard(
    featureValues(left, 'countries'),
    featureValues(right, 'countries'),
  );
  if (countrySimilarity !== null) components.set('countries', countrySimilarity);

  if (left.runtimeMinutes !== null && right.runtimeMinutes !== null) {
    const scale = left.medium === 'movie' ? 90 : 45;
    components.set(
      'runtime',
      Math.max(0, 1 - Math.abs(left.runtimeMinutes - right.runtimeMinutes) / scale),
    );
  }

  if (left.medium === 'series' && left.seasons !== null && right.seasons !== null) {
    components.set(
      'seasons',
      Math.max(
        0,
        1 - Math.abs(left.seasons - right.seasons) / Math.max(left.seasons, right.seasons, 1),
      ),
    );
  }

  const weights = NEIGHBOR_WEIGHTS[left.medium];
  const denominator = [...components.keys()].reduce((sum, family) => sum + weights[family], 0);
  if (denominator === 0) return { score: 0, familyCount: components.size };

  const score =
    [...components.entries()].reduce((sum, [family, value]) => sum + weights[family] * value, 0) /
    denominator;

  return { score, familyCount: components.size };
}

function observedHistory(rows: PersonalFitScoringRow[]): MediaTitleView[] {
  return rows
    .map((row) => row.view)
    .filter((item) => {
      if (item.rating === null) return false;
      if (item.medium === 'movie') return item.state === 'Vista' || item.state === 'Reveer';
      return item.state === 'Terminada' || item.state === 'Reveer';
    });
}

function neighborPrediction(candidate: MediaTitleView, history: MediaTitleView[]): number | null {
  const comparable = history
    .map((item) => ({ item, ...similarity(candidate, item) }))
    .filter(
      (entry) =>
        entry.familyCount >= MIN_NEIGHBOR_FAMILIES && entry.score >= MIN_NEIGHBOR_SIMILARITY,
    )
    .sort((left, right) => right.score - left.score || left.item.key.localeCompare(right.item.key))
    .slice(0, MAX_NEIGHBORS);

  if (comparable.length === 0) return null;
  const denominator = comparable.reduce((sum, entry) => sum + entry.score, 0);
  if (denominator === 0) return null;
  return (
    comparable.reduce((sum, entry) => sum + entry.score * (entry.item.rating ?? 0), 0) / denominator
  );
}

function profilePrediction(candidate: MediaTitleView, history: MediaTitleView[]): number | null {
  if (history.length === 0) return null;
  const ratings = history.flatMap((item) => (item.rating === null ? [] : [item.rating]));
  if (ratings.length === 0) return null;
  const mean = average(ratings);
  const effects = new Map<FeatureFamily, number>();
  const weights = PROFILE_WEIGHTS[candidate.medium];

  for (const family of featureFamilies(candidate.medium)) {
    const byValue = new Map<string, number[]>();
    for (const item of history) {
      if (item.rating === null) continue;
      for (const value of new Set(featureValues(item, family))) {
        const existing = byValue.get(value) ?? [];
        existing.push(item.rating);
        byValue.set(value, existing);
      }
    }

    const supported = featureValues(candidate, family).flatMap((value) => {
      const values = byValue.get(value);
      if (!values || values.length === 0) return [];
      const support = values.length / (values.length + SHRINKAGE_K[family]);
      return [support * (average(values) - mean)];
    });
    if (supported.length > 0) effects.set(family, average(supported));
  }

  if (effects.size === 0) return mean;
  const denominator = [...effects.keys()].reduce((sum, family) => sum + weights[family], 0);
  if (denominator === 0) return mean;
  const adjustment = [...effects.entries()].reduce(
    (sum, [family, effect]) => sum + (weights[family] / denominator) * effect,
    0,
  );
  return clamp(mean + adjustment, 0, 10);
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: Set<T>,
): T | null {
  const value = record[key];
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : null;
}

export function parseExperienceProfile(value: unknown): MediaExperienceProfile | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  return {
    character_focus: readEnum(record, 'character_focus', ORDINAL_LEVELS),
    character_complexity: readEnum(record, 'character_complexity', ORDINAL_LEVELS),
    emotional_intensity: readEnum(record, 'emotional_intensity', ORDINAL_LEVELS),
    pace: readEnum(record, 'pace', PACES),
    narrative_complexity: readEnum(record, 'narrative_complexity', ORDINAL_LEVELS),
    ambiguity: readEnum(record, 'ambiguity', ORDINAL_LEVELS),
    mystery_drive: readEnum(record, 'mystery_drive', ORDINAL_LEVELS),
    dialogue_emphasis: readEnum(record, 'dialogue_emphasis', ORDINAL_LEVELS),
    multi_thread: typeof record.multi_thread === 'boolean' ? record.multi_thread : null,
    moral_complexity: readEnum(record, 'moral_complexity', ORDINAL_LEVELS),
    strategy_politics: readEnum(record, 'strategy_politics', ORDINAL_LEVELS),
    dark_humor: readEnum(record, 'dark_humor', ORDINAL_LEVELS),
    horror_mode: readEnum(record, 'horror_mode', HORROR_MODES),
    romance_mode: readEnum(record, 'romance_mode', ROMANCE_MODES),
    music_emphasis: readEnum(record, 'music_emphasis', ORDINAL_LEVELS),
    visual_emphasis: readEnum(record, 'visual_emphasis', ORDINAL_LEVELS),
    twist_style: readEnum(record, 'twist_style', TWIST_STYLES),
    internal_coherence: readEnum(record, 'internal_coherence', ORDINAL_LEVELS),
    originality_signal: readEnum(record, 'originality_signal', ORDINAL_LEVELS),
    formula_risk: readEnum(record, 'formula_risk', ORDINAL_LEVELS),
  };
}

function ordinalEffect(value: OrdinalLevel | null): number {
  if (value === 'high') return 1;
  if (value === 'low') return -1;
  return 0;
}

function profilePreferenceAdjustment(profile: MediaExperienceProfile | null): number {
  if (!profile) return 0;
  let weighted = 0;
  let denominator = 0;

  for (const [key, weight] of Object.entries(ORDINAL_PROFILE_WEIGHTS) as [
    WeightedProfileKey,
    number,
  ][]) {
    const value = profile[key];
    if (value === null || value === 'uncertain') continue;
    weighted += weight * ordinalEffect(value);
    denominator += weight;
  }

  if (profile.formula_risk && profile.formula_risk !== 'uncertain') {
    const riskEffect =
      profile.formula_risk === 'high' ? -1 : profile.formula_risk === 'low' ? 0.6 : 0;
    weighted += 0.28 * riskEffect;
    denominator += 0.28;
  }

  let adjustment = denominator > 0 ? (weighted / denominator) * 0.45 : 0;

  if (profile.pace === 'fast') adjustment += 0.04;
  if (profile.pace === 'variable') adjustment += 0.03;
  if (profile.pace === 'moderate') adjustment += 0.01;
  if (profile.pace === 'slow') {
    const purposefulSlow =
      profile.character_focus === 'high' ||
      profile.narrative_complexity === 'high' ||
      profile.mystery_drive === 'high';
    if (!purposefulSlow) adjustment -= 0.08;
  }

  if (profile.horror_mode === 'psychological' || profile.horror_mode === 'thematic') {
    adjustment += 0.08;
  } else if (profile.horror_mode === 'mixed') {
    adjustment += 0.04;
  }

  if (profile.romance_mode === 'grounded') adjustment += 0.08;
  if (profile.romance_mode === 'mixed') adjustment += 0.03;
  if (profile.romance_mode === 'heightened') adjustment -= 0.04;
  if (profile.romance_mode === 'melodramatic') adjustment -= 0.1;
  if (profile.romance_mode === 'comedic') adjustment -= 0.03;

  if (profile.twist_style === 'fair_setup') adjustment += 0.08;
  if (profile.twist_style === 'ambiguity_driven') adjustment += 0.06;
  if (profile.twist_style === 'reveal_driven') adjustment += 0.02;
  if (profile.multi_thread) adjustment += 0.02;

  return clamp(adjustment, -0.55, 0.55);
}

/**
 * Mild preference handicap requested for older movies only.
 * 1990 onward, including every post-2010 title, receives no era penalty.
 */
export function movieEraHandicap(year: number | null): number {
  if (year === null || year >= 1990) return 0;
  const decadesAway = Math.ceil((1990 - year) / 10);
  return -Math.min(0.4, decadesAway * 0.08);
}

function estimatePersonalFit(row: PersonalFitScoringRow, history: MediaTitleView[]): number | null {
  if (row.view.rating !== null) return null;
  if (history.length === 0) return row.view.affinity;

  const neighbor = neighborPrediction(row.view, history);
  const profile = profilePrediction(row.view, history);
  let base: number | null = null;
  if (neighbor !== null && profile !== null) base = 0.6 * neighbor + 0.4 * profile;
  else base = neighbor ?? profile ?? row.view.affinity;
  if (base === null) return null;

  const qualitative = profilePreferenceAdjustment(row.experienceProfile);
  const era = row.view.medium === 'movie' ? movieEraHandicap(row.view.year) : 0;
  return Math.round(clamp(base + qualitative + era, 0, 10) * 100) / 100;
}

/**
 * Read-time only. It never writes the canonical Sheet and never replaces an observed Nota.
 */
export function attachProvisionalPersonalFit(rows: PersonalFitScoringRow[]): MediaTitleView[] {
  const history = observedHistory(rows);
  return rows.map((row) => ({
    ...row.view,
    personalFitEstimate: estimatePersonalFit(
      row,
      history.filter((item) => item.medium === row.view.medium),
    ),
  }));
}
