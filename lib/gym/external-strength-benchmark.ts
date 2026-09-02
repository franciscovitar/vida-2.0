import {
  findGymStrengthBenchmarkBaseline,
  GYM_MALE_ABSOLUTE_1RM_BASELINE,
  GYM_MALE_ABSOLUTE_1RM_BASELINE_VERSION,
  type GymStrengthBenchmarkBaselineEntry,
  type GymStrengthBenchmarkComparability,
  type GymStrengthBenchmarkExerciseId,
  type GymStrengthExerciseConfidence,
  type GymStrengthThresholds,
} from '@/lib/gym/strength-benchmark-baseline';
import { estimateEpleyOneRepMax } from '@/lib/gym/strength-estimation';

export type GymStrengthLevelId =
  | 'below-beginner'
  | 'beginner'
  | 'novice'
  | 'intermediate'
  | 'advanced'
  | 'elite';

export type GymStrengthBenchmarkConfidence = 'low' | 'medium';

export interface GymStrengthBenchmarkTrendInput {
  exerciseName: string;
  latestDate: string;
  latestLoad: number | null;
  latestReps: number | null;
}

export interface GymStrengthBenchmarkExercise {
  id: GymStrengthBenchmarkExerciseId;
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
  comparability: GymStrengthBenchmarkComparability;
  confidence: GymStrengthExerciseConfidence;
  confidenceLabel: string;
  note: string;
}

export interface GymExternalStrengthBenchmark {
  status: 'ready' | 'not-ready';
  label: string;
  detail: string;
  confidence: GymStrengthBenchmarkConfidence | null;
  confidenceLabel: string | null;
  scopeLabel: string;
  referenceLabel: string;
  baselineVersion: string;
  methodologyNote: string;
  exercises: readonly GymStrengthBenchmarkExercise[];
}

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

const CONFIDENCE_LABELS: Readonly<Record<GymStrengthExerciseConfidence, string>> = {
  high: 'Confianza alta',
  medium: 'Confianza media',
  low: 'Confianza baja',
};

const CONFIDENCE_ORDER: Readonly<Record<GymStrengthExerciseConfidence, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function isExternalStrengthBenchmarkSupported(exerciseName: string): boolean {
  return findGymStrengthBenchmarkBaseline(exerciseName) !== null;
}

function levelFor(estimatedOneRepMaxKg: number, thresholds: GymStrengthThresholds): GymStrengthLevelId {
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

function thresholdFor(level: GymStrengthLevelId, thresholds: GymStrengthThresholds): number | null {
  if (level === 'below-beginner') return 0;
  return thresholds[level];
}

function progressToNextLevel(
  estimatedOneRepMaxKg: number,
  level: GymStrengthLevelId,
  nextLevel: GymStrengthLevelId | null,
  thresholds: GymStrengthThresholds,
): number | null {
  if (nextLevel === null) return null;
  const currentThreshold = thresholdFor(level, thresholds) ?? 0;
  const nextThreshold = thresholdFor(nextLevel, thresholds);
  if (nextThreshold === null || nextThreshold <= currentThreshold) return null;
  const fraction = (estimatedOneRepMaxKg - currentThreshold) / (nextThreshold - currentThreshold);
  return Math.max(0, Math.min(100, Math.round(fraction * 100)));
}

function latestEligibleTrend(
  benchmark: GymStrengthBenchmarkBaselineEntry,
  trends: readonly GymStrengthBenchmarkTrendInput[],
): (GymStrengthBenchmarkTrendInput & { estimatedOneRepMaxKg: number }) | null {
  return (
    trends
      .filter((trend) => benchmark.matches(trend.exerciseName))
      .flatMap((trend) => {
        if (trend.latestLoad === null || trend.latestReps === null) return [];
        const estimatedOneRepMaxKg = estimateEpleyOneRepMax(trend.latestLoad, trend.latestReps);
        return estimatedOneRepMaxKg === null ? [] : [{ ...trend, estimatedOneRepMaxKg }];
      })
      .slice()
      .sort(
        (a, b) =>
          b.latestDate.localeCompare(a.latestDate) ||
          b.estimatedOneRepMaxKg - a.estimatedOneRepMaxKg,
      )[0] ?? null
  );
}

function overallLabel(exercises: readonly GymStrengthBenchmarkExercise[]): string {
  if (exercises.length === 0) return 'Sin nivel comparable';
  const ordered = exercises
    .map((exercise) => LEVEL_ORDER.indexOf(exercise.level))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  const conservativeMedian = ordered[Math.floor((ordered.length - 1) / 2)] ?? 0;
  return LEVEL_LABELS[LEVEL_ORDER[conservativeMedian] ?? 'below-beginner'];
}

function overallConfidence(
  exercises: readonly GymStrengthBenchmarkExercise[],
): GymStrengthBenchmarkConfidence {
  const higherConfidenceCount = exercises.filter(
    (exercise) => exercise.confidence === 'high' || exercise.confidence === 'medium',
  ).length;
  return exercises.length >= 3 && higherConfidenceCount >= 1 ? 'medium' : 'low';
}

export function buildMaleStrengthLevelBenchmark(
  trends: readonly GymStrengthBenchmarkTrendInput[],
): GymExternalStrengthBenchmark {
  const exercises = GYM_MALE_ABSOLUTE_1RM_BASELINE.flatMap((benchmark) => {
    const trend = latestEligibleTrend(benchmark, trends);
    if (!trend || trend.latestLoad === null || trend.latestReps === null) return [];

    const level = levelFor(trend.estimatedOneRepMaxKg, benchmark.thresholds);
    const nextLevel = nextLevelFor(level);
    const nextThresholdKg = nextLevel === null ? null : thresholdFor(nextLevel, benchmark.thresholds);

    return [
      {
        id: benchmark.id,
        exerciseName: trend.exerciseName,
        benchmarkName: benchmark.benchmarkName,
        latestDate: trend.latestDate,
        loadKg: trend.latestLoad,
        reps: trend.latestReps,
        estimatedOneRepMaxKg: trend.estimatedOneRepMaxKg,
        level,
        levelLabel: LEVEL_LABELS[level],
        nextLevel,
        nextLevelLabel: nextLevel === null ? null : LEVEL_LABELS[nextLevel],
        nextThresholdKg,
        nextLevelProgressPercent: progressToNextLevel(
          trend.estimatedOneRepMaxKg,
          level,
          nextLevel,
          benchmark.thresholds,
        ),
        comparability: benchmark.comparability,
        confidence: benchmark.confidence,
        confidenceLabel: CONFIDENCE_LABELS[benchmark.confidence],
        note: benchmark.note,
      } satisfies GymStrengthBenchmarkExercise,
    ];
  }).sort(
    (a, b) =>
      CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
      b.latestDate.localeCompare(a.latestDate) ||
      a.benchmarkName.localeCompare(b.benchmarkName, 'es'),
  );

  if (exercises.length === 0) {
    return {
      status: 'not-ready',
      label: 'Sin nivel comparable',
      detail:
        'Todavía no hay un set de 1–15 repeticiones que pueda convertirse a e1RM dentro de la tabla fija de referencia.',
      confidence: null,
      confidenceLabel: null,
      scopeLabel: 'Hombres · 1RM absoluto',
      referenceLabel: 'Referencia fija Vida 2.0',
      baselineVersion: GYM_MALE_ABSOLUTE_1RM_BASELINE_VERSION,
      methodologyNote:
        'Se usa Epley sobre el set registrado. Las máquinas y poleas se muestran con menor confianza por diferencias de equipamiento.',
      exercises: [],
    };
  }

  const confidence = overallConfidence(exercises);

  return {
    status: 'ready',
    label: overallLabel(exercises),
    detail: `${exercises.length} ejercicio(s) evaluables con la tabla fija. El nivel general usa una mediana conservadora de los niveles por ejercicio.`,
    confidence,
    confidenceLabel: confidence === 'medium' ? 'Confianza media' : 'Confianza baja',
    scopeLabel: 'Hombres · 1RM absoluto',
    referenceLabel: 'Referencia fija Vida 2.0',
    baselineVersion: GYM_MALE_ABSOLUTE_1RM_BASELINE_VERSION,
    methodologyNote:
      'e1RM por Epley, solo para sets de 1–15 reps. Mancuernas se comparan por mancuerna; máquinas y poleas conservan una advertencia de comparabilidad.',
    exercises,
  };
}
