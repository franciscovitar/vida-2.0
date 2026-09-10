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
  'below-beginner' | 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export type GymStrengthBenchmarkConfidence = 'low' | 'medium';

export interface GymStrengthBenchmarkObservation {
  date: string;
  performance: number;
}

export interface GymStrengthBenchmarkTrendInput {
  exerciseName: string;
  latestDate: string;
  latestLoad: number | null;
  latestReps: number | null;
  observations?: readonly GymStrengthBenchmarkObservation[];
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
  nextLevelEtaLabel: string | null;
  nextLevelEtaDetail: string | null;
  comparability: GymStrengthBenchmarkComparability;
  confidence: GymStrengthExerciseConfidence;
  confidenceLabel: string;
  note: string;
}

export interface GymExternalStrengthBenchmark {
  status: 'ready' | 'not-ready';
  level: GymStrengthLevelId | null;
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

const DAY_MS = 86_400_000;

export function isExternalStrengthBenchmarkSupported(exerciseName: string): boolean {
  return findGymStrengthBenchmarkBaseline(exerciseName) !== null;
}

function levelFor(
  estimatedOneRepMaxKg: number,
  thresholds: GymStrengthThresholds,
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

function dateMs(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const value = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(value) ? value : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle] ?? null;
  const left = ordered[middle - 1];
  const right = ordered[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function durationLabel(days: number): string {
  if (days < 45) return `${Math.max(1, Math.round(days / 7))} sem`;
  return `${Math.max(1, Math.round(days / 30.4))} meses`;
}

function estimateNextLevelEta(
  observations: readonly GymStrengthBenchmarkObservation[] | undefined,
  current: number,
  target: number | null,
): { label: string | null; detail: string | null } {
  if (!observations || target === null || target <= current) return { label: null, detail: null };

  const usable = observations
    .filter(
      (item) =>
        dateMs(item.date) !== null && Number.isFinite(item.performance) && item.performance > 0,
    )
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-6);
  if (usable.length < 3) {
    return {
      label: 'Más datos para estimar',
      detail: 'La ETA aparece con al menos 3 exposiciones comparables fechadas.',
    };
  }

  const firstMs = dateMs(usable[0]!.date)!;
  const lastMs = dateMs(usable.at(-1)!.date)!;
  const spanDays = Math.round((lastMs - firstMs) / DAY_MS);
  if (spanDays < 7) {
    return {
      label: 'Más datos para estimar',
      detail: 'Las exposiciones todavía están demasiado juntas para proyectar una fecha útil.',
    };
  }

  const dailyLogRates: number[] = [];
  for (let index = 1; index < usable.length; index += 1) {
    const previous = usable[index - 1]!;
    const next = usable[index]!;
    const previousMs = dateMs(previous.date)!;
    const nextMs = dateMs(next.date)!;
    const days = (nextMs - previousMs) / DAY_MS;
    if (days <= 0 || previous.performance <= 0 || next.performance <= 0) continue;
    dailyLogRates.push(Math.log(next.performance / previous.performance) / days);
  }

  const rawRate = median(dailyLogRates);
  if (rawRate === null || rawRate <= 0.00005) {
    return {
      label: 'Sin ETA confiable',
      detail: 'El historial reciente no muestra todavía una velocidad positiva y repetible para proyectar el próximo rango.',
    };
  }

  // La proyección usa crecimiento relativo (log), no kg/semana. Se reduce el ritmo
  // observado y se limita el máximo para que un PR aislado no produzca una ETA absurda.
  const evidenceShrink = usable.length >= 5 && spanDays >= 28 ? 0.72 : usable.length >= 4 ? 0.62 : 0.52;
  const projectedDailyRate = Math.min(rawRate * evidenceShrink * 0.7, 0.0015);
  if (projectedDailyRate <= 0) return { label: 'Sin ETA confiable', detail: null };

  const centralDays = Math.log(target / current) / projectedDailyRate;
  if (!Number.isFinite(centralDays) || centralDays <= 0 || centralDays > 730) {
    return {
      label: 'Sin ETA confiable',
      detail: 'El próximo rango queda demasiado lejos para una proyección útil con los datos actuales.',
    };
  }

  const confidenceMedium = usable.length >= 5 && spanDays >= 28;
  const lowFactor = confidenceMedium ? 0.75 : 0.6;
  const highFactor = confidenceMedium ? 1.4 : 1.8;
  const lowDays = Math.max(7, centralDays * lowFactor);
  const highDays = Math.max(lowDays + 7, centralDays * highFactor);
  return {
    label: `≈ ${durationLabel(lowDays)}–${durationLabel(highDays)}`,
    detail: `Proyección dinámica con ${usable.length} exposiciones en ${spanDays} días; usa crecimiento relativo y desaceleración conservadora.`,
  };
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

function overallLevel(exercises: readonly GymStrengthBenchmarkExercise[]): GymStrengthLevelId | null {
  if (exercises.length === 0) return null;
  const ordered = exercises
    .map((exercise) => LEVEL_ORDER.indexOf(exercise.level))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  const conservativeMedian = ordered[Math.floor((ordered.length - 1) / 2)] ?? 0;
  return LEVEL_ORDER[conservativeMedian] ?? 'below-beginner';
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
    const nextThresholdKg =
      nextLevel === null ? null : thresholdFor(nextLevel, benchmark.thresholds);
    const eta = estimateNextLevelEta(
      trend.observations,
      trend.estimatedOneRepMaxKg,
      nextThresholdKg,
    );

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
        nextLevelEtaLabel: eta.label,
        nextLevelEtaDetail: eta.detail,
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
      level: null,
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
  const level = overallLevel(exercises);

  return {
    status: 'ready',
    level,
    label: level ? LEVEL_LABELS[level] : 'Sin nivel comparable',
    detail: `${exercises.length} ejercicio(s) evaluables con la tabla fija. El nivel general usa una mediana conservadora de los niveles por ejercicio.`,
    confidence,
    confidenceLabel: confidence === 'medium' ? 'Confianza media' : 'Confianza baja',
    scopeLabel: 'Hombres · 1RM absoluto',
    referenceLabel: 'Referencia fija Vida 2.0',
    baselineVersion: GYM_MALE_ABSOLUTE_1RM_BASELINE_VERSION,
    methodologyNote:
      'e1RM por Epley, solo para sets de 1–15 reps. Mancuernas se comparan por mancuerna; máquinas y poleas conservan una advertencia de comparabilidad. Las ETA usan varias exposiciones y se ocultan cuando la tendencia no es suficientemente estable.',
    exercises,
  };
}
