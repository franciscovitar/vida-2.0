export type GymStrengthLevelId =
  'below-beginner' | 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export type GymStrengthBenchmarkConfidence = 'low' | 'medium';

export interface GymStrengthBenchmarkTrendInput {
  exerciseName: string;
  latestDate: string;
  latestLoad: number | null;
  latestReps: number | null;
  latestPerformance: number | null;
}

export interface GymStrengthBenchmarkExercise {
  id: 'dumbbell-curl' | 'dumbbell-lateral-raise';
  exerciseName: string;
  benchmarkName: string;
  latestDate: string;
  loadKg: number;
  reps: number;
  estimatedOneRepMaxKg: number;
  level: GymStrengthLevelId;
  levelLabel: string;
  nextLevel: GymStrengthLevelId | null;
  nextLevelLabel: string | null;
  nextThresholdKg: number | null;
  nextLevelProgressPercent: number | null;
  sourceUrl: string;
}

export interface GymExternalStrengthBenchmark {
  status: 'ready' | 'not-ready';
  label: string;
  detail: string;
  confidence: GymStrengthBenchmarkConfidence | null;
  confidenceLabel: string | null;
  scopeLabel: string;
  sourceLabel: string;
  sourceDataCutoff: string;
  populationNote: string;
  exercises: readonly GymStrengthBenchmarkExercise[];
}

type SupportedBenchmark = {
  id: GymStrengthBenchmarkExercise['id'];
  benchmarkName: string;
  matches: (exerciseName: string) => boolean;
  thresholds: Readonly<Record<Exclude<GymStrengthLevelId, 'below-beginner'>, number>>;
  sourceUrl: string;
};

const LEVEL_ORDER: readonly GymStrengthLevelId[] = [
  'below-beginner',
  'beginner',
  'novice',
  'intermediate',
  'advanced',
  'elite',
];

const LEVEL_LABELS: Readonly<Record<GymStrengthLevelId, string>> = {
  'below-beginner': 'Inicial',
  beginner: 'Principiante',
  novice: 'Novato',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
  elite: 'Élite',
};

/**
 * Strength Level male absolute 1RM standards, kg per dumbbell.
 * Source data cutoff reported by Strength Level: 2026-03-05.
 * These are community standards, not a representative general-population sample.
 */
const SUPPORTED_BENCHMARKS: readonly SupportedBenchmark[] = [
  {
    id: 'dumbbell-curl',
    benchmarkName: 'Curl con mancuerna',
    matches: (exerciseName) => /curl de b[ií]ceps con mancuernas/i.test(exerciseName),
    thresholds: {
      beginner: 7,
      novice: 13,
      intermediate: 21,
      advanced: 31,
      elite: 42,
    },
    sourceUrl: 'https://strengthlevel.com/strength-standards/dumbbell-curl/kg',
  },
  {
    id: 'dumbbell-lateral-raise',
    benchmarkName: 'Elevación lateral con mancuerna',
    matches: (exerciseName) => /elevaciones? laterales? con mancuernas/i.test(exerciseName),
    thresholds: {
      beginner: 4,
      novice: 9,
      intermediate: 16,
      advanced: 24,
      elite: 34,
    },
    sourceUrl: 'https://strengthlevel.com/strength-standards/dumbbell-lateral-raise/kg',
  },
];

/**
 * Indica si el nombre registrado tiene una referencia externa compatible.
 * No implica que el set actual sea elegible para estimar 1RM (1–15 reps).
 */
export function isExternalStrengthBenchmarkSupported(exerciseName: string): boolean {
  return SUPPORTED_BENCHMARKS.some((benchmark) => benchmark.matches(exerciseName));
}

function levelFor(
  estimatedOneRepMaxKg: number,
  thresholds: SupportedBenchmark['thresholds'],
): GymStrengthLevelId {
  if (estimatedOneRepMaxKg >= thresholds.elite) return 'elite';
  if (estimatedOneRepMaxKg >= thresholds.advanced) return 'advanced';
  if (estimatedOneRepMaxKg >= thresholds.intermediate) return 'intermediate';
  if (estimatedOneRepMaxKg >= thresholds.novice) return 'novice';
  if (estimatedOneRepMaxKg >= thresholds.beginner) return 'beginner';
  return 'below-beginner';
}

function nextLevelFor(level: GymStrengthLevelId): GymStrengthLevelId | null {
  const index = LEVEL_ORDER.indexOf(level);
  if (index < 0 || index >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[index + 1] ?? null;
}

function thresholdFor(
  level: GymStrengthLevelId,
  thresholds: SupportedBenchmark['thresholds'],
): number | null {
  if (level === 'below-beginner') return 0;
  return thresholds[level];
}

function progressToNextLevel(
  estimatedOneRepMaxKg: number,
  level: GymStrengthLevelId,
  nextLevel: GymStrengthLevelId | null,
  thresholds: SupportedBenchmark['thresholds'],
): number | null {
  if (nextLevel === null) return null;
  const currentThreshold = thresholdFor(level, thresholds) ?? 0;
  const nextThreshold = thresholdFor(nextLevel, thresholds);
  if (nextThreshold === null || nextThreshold <= currentThreshold) return null;
  const fraction = (estimatedOneRepMaxKg - currentThreshold) / (nextThreshold - currentThreshold);
  return Math.max(0, Math.min(100, Math.round(fraction * 100)));
}

function latestEligibleTrend(
  benchmark: SupportedBenchmark,
  trends: readonly GymStrengthBenchmarkTrendInput[],
): GymStrengthBenchmarkTrendInput | null {
  return (
    trends
      .filter((trend) => benchmark.matches(trend.exerciseName))
      .filter(
        (trend) =>
          trend.latestPerformance !== null &&
          trend.latestLoad !== null &&
          trend.latestReps !== null &&
          trend.latestReps >= 1 &&
          trend.latestReps <= 15,
      )
      .slice()
      .sort(
        (a, b) =>
          b.latestDate.localeCompare(a.latestDate) ||
          (b.latestPerformance ?? 0) - (a.latestPerformance ?? 0),
      )[0] ?? null
  );
}

function overallLabel(exercises: readonly GymStrengthBenchmarkExercise[]): string {
  if (exercises.length === 0) return 'Sin nivel comparable';
  const levels = new Set(exercises.map((exercise) => exercise.level));
  if (levels.size === 1) return LEVEL_LABELS[exercises[0]!.level];
  return 'Nivel mixto';
}

export function buildMaleStrengthLevelBenchmark(
  trends: readonly GymStrengthBenchmarkTrendInput[],
): GymExternalStrengthBenchmark {
  const exercises = SUPPORTED_BENCHMARKS.flatMap((benchmark) => {
    const trend = latestEligibleTrend(benchmark, trends);
    if (
      !trend ||
      trend.latestPerformance === null ||
      trend.latestLoad === null ||
      trend.latestReps === null
    ) {
      return [];
    }

    const level = levelFor(trend.latestPerformance, benchmark.thresholds);
    const nextLevel = nextLevelFor(level);
    const nextThresholdKg =
      nextLevel === null ? null : thresholdFor(nextLevel, benchmark.thresholds);

    return [
      {
        id: benchmark.id,
        exerciseName: trend.exerciseName,
        benchmarkName: benchmark.benchmarkName,
        latestDate: trend.latestDate,
        loadKg: trend.latestLoad,
        reps: trend.latestReps,
        estimatedOneRepMaxKg: trend.latestPerformance,
        level,
        levelLabel: LEVEL_LABELS[level],
        nextLevel,
        nextLevelLabel: nextLevel === null ? null : LEVEL_LABELS[nextLevel],
        nextThresholdKg,
        nextLevelProgressPercent: progressToNextLevel(
          trend.latestPerformance,
          level,
          nextLevel,
          benchmark.thresholds,
        ),
        sourceUrl: benchmark.sourceUrl,
      } satisfies GymStrengthBenchmarkExercise,
    ];
  });

  if (exercises.length === 0) {
    return {
      status: 'not-ready',
      label: 'Sin nivel comparable',
      detail:
        'Las cargas actuales de máquinas y poleas no se convierten en un nivel externo porque el equipo puede cambiar la resistencia real.',
      confidence: null,
      confidenceLabel: null,
      scopeLabel: 'Referencia masculina · cargas absolutas',
      sourceLabel: 'Strength Level',
      sourceDataCutoff: '2026-03-05',
      populationNote: 'Referencia de usuarios de Strength Level, no de la población general.',
      exercises: [],
    };
  }

  const confidence: GymStrengthBenchmarkConfidence = exercises.length >= 2 ? 'medium' : 'low';

  return {
    status: 'ready',
    label: overallLabel(exercises),
    detail: `${exercises.length} ejercicio(s) con una referencia externa compatible. El nivel usa e1RM estimado y no está ajustado por peso corporal ni edad.`,
    confidence,
    confidenceLabel: confidence === 'medium' ? 'Confianza media' : 'Confianza baja',
    scopeLabel: 'Hombres · referencia absoluta',
    sourceLabel: 'Strength Level',
    sourceDataCutoff: '2026-03-05',
    populationNote: 'Referencia de usuarios de Strength Level, no de la población general.',
    exercises,
  };
}
