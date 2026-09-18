import type {
  HealthBaselineSignal,
  HealthImportKind,
  HealthPageData,
  HealthSignalId,
} from '@/types/domain-pages';

export type HealthScoreId =
  'sleep' | 'recovery' | 'activity' | 'cardio-stability' | 'mobility' | 'readiness';

export type HealthScoreBand = 'strong' | 'good' | 'below-usual' | 'low' | 'insufficient';
export type HealthScoreTrend = 'up' | 'down' | 'stable' | 'unknown';
export type HealthScoreConfidenceBand = 'high' | 'medium' | 'low';
export type HealthScoreReliabilityTier = 'A' | 'B' | 'C';
export type HealthScoreContributorDirection = 'positive' | 'negative' | 'neutral' | 'unknown';

export interface HealthScoreContributor {
  id: string;
  label: string;
  /** null = contributor unavailable. Missing never becomes zero. */
  score: number | null;
  weight: number;
  reliability: HealthScoreReliabilityTier;
  direction: HealthScoreContributorDirection;
  detail: string;
  evidenceRefs: readonly HealthSignalId[];
}

export interface HealthExplainableScore {
  id: HealthScoreId;
  label: string;
  question: string;
  /** null = insufficient evidence; never fabricate a numeric score. */
  score: number | null;
  band: HealthScoreBand;
  confidence: number;
  confidenceBand: HealthScoreConfidenceBand;
  personalPosition: string;
  trend: HealthScoreTrend;
  contributors: readonly HealthScoreContributor[];
  uncertainties: readonly string[];
  calculationVersion: 'health-scores-v1.1.0';
}

export interface HealthMomentum {
  score: number | null;
  direction: 'improving' | 'stable' | 'declining' | 'insufficient';
  confidence: number;
  detail: string;
  contributors: readonly HealthScoreContributor[];
  calculationVersion: 'health-momentum-v1.1.0';
}

export interface HealthScoreboard {
  readiness: HealthExplainableScore;
  domains: readonly HealthExplainableScore[];
  momentum: HealthMomentum;
}

interface WeightedContributor extends HealthScoreContributor {
  baselineFactor: number;
}

interface AggregatedScore {
  score: number | null;
  confidence: number;
}

const RELIABILITY_FACTOR: Readonly<Record<HealthScoreReliabilityTier, number>> = {
  A: 0.95,
  B: 0.82,
  C: 0.62,
};

const SCORE_VERSION = 'health-scores-v1.1.0' as const;
const MOMENTUM_VERSION = 'health-momentum-v1.1.0' as const;
const STRONG_BASELINE_DAYS = 14;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function linear(points: readonly (readonly [number, number])[], value: number): number {
  if (points.length === 0) return 0;
  if (value <= points[0][0]) return points[0][1];
  const last = points.at(-1) as readonly [number, number];
  if (value >= last[0]) return last[1];

  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (value <= x2) {
      const ratio = (value - x1) / (x2 - x1);
      return y1 + ratio * (y2 - y1);
    }
  }
  return last[1];
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  if (values.some((value) => value <= 0)) return 0;
  const logMean = values.reduce((sum, value) => sum + Math.log(value), 0) / values.length;
  return Math.exp(logMean);
}

function baselineFactor(days: number): number {
  return clamp(days / STRONG_BASELINE_DAYS);
}

function importFactor(kind: HealthImportKind | 'missing'): number {
  if (kind === 'complete') return 1;
  if (kind === 'partial') return 0.82;
  if (kind === 'source-incomplete') return 0.68;
  if (kind === 'none') return 0.78;
  return 0.45;
}

function bandFor(score: number | null): HealthScoreBand {
  if (score === null) return 'insufficient';
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'below-usual';
  return 'low';
}

function confidenceBandFor(confidence: number): HealthScoreConfidenceBand {
  if (confidence >= 80) return 'high';
  if (confidence >= 55) return 'medium';
  return 'low';
}

function directionForDelta(deltaRelative: number | null, tolerance = 0.05): HealthScoreTrend {
  if (deltaRelative === null || !Number.isFinite(deltaRelative)) return 'unknown';
  if (deltaRelative > tolerance) return 'up';
  if (deltaRelative < -tolerance) return 'down';
  return 'stable';
}

function scorePosition(score: number | null): string {
  if (score === null) return 'Evidencia insuficiente para puntuar';
  if (score >= 80) return 'Señales fuertes en la evidencia disponible';
  if (score >= 60) return 'Dentro de un rango razonable';
  if (score >= 40) return 'Por debajo de tu patrón deseable';
  return 'Varias señales merecen atención';
}

function weightedAggregate(
  contributors: readonly WeightedContributor[],
  sourceFactor: number,
  minCoverage: number,
): AggregatedScore {
  const totalWeight = contributors.reduce((sum, item) => sum + item.weight, 0);
  const available = contributors.filter((item) => item.score !== null);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const coverage = totalWeight === 0 ? 0 : availableWeight / totalWeight;

  if (availableWeight === 0 || coverage < minCoverage) {
    return {
      score: null,
      confidence: roundScore(
        100 *
          geometricMean([
            Math.max(coverage, 0.01),
            Math.max(sourceFactor, 0.01),
            0.35,
            0.6,
          ]),
      ),
    };
  }

  const score =
    available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) /
    availableWeight;
  const reliability =
    available.reduce((sum, item) => sum + RELIABILITY_FACTOR[item.reliability] * item.weight, 0) /
    availableWeight;
  const baseline =
    available.reduce((sum, item) => sum + item.baselineFactor * item.weight, 0) / availableWeight;

  return {
    score: roundScore(score),
    confidence: roundScore(
      100 *
        geometricMean([
          Math.max(coverage, 0.01),
          Math.max(sourceFactor, 0.01),
          Math.max(reliability, 0.01),
          Math.max(baseline, 0.01),
        ]),
    ),
  };
}

function contributor(
  input: Omit<WeightedContributor, 'baselineFactor'> & { baselineDays?: number | null },
): WeightedContributor {
  return {
    ...input,
    baselineFactor:
      input.baselineDays === undefined || input.baselineDays === null
        ? 1
        : baselineFactor(input.baselineDays),
  };
}

function personalDeviationScore(
  value: number,
  baseline: number,
  direction: 'lower-is-worse' | 'higher-is-worse' | 'symmetric',
): number {
  if (baseline === 0) return 80;
  const relative = (value - baseline) / Math.abs(baseline);

  if (direction === 'lower-is-worse') {
    return roundScore(
      linear(
        [
          [-0.35, 25],
          [-0.2, 55],
          [-0.1, 75],
          [-0.05, 88],
          [0, 96],
          [0.15, 98],
        ],
        relative,
      ),
    );
  }

  if (direction === 'higher-is-worse') {
    return roundScore(
      linear(
        [
          [-0.15, 96],
          [0, 96],
          [0.035, 86],
          [0.07, 66],
          [0.12, 42],
          [0.2, 18],
        ],
        relative,
      ),
    );
  }

  return roundScore(
    linear(
      [
        [0, 98],
        [0.04, 94],
        [0.08, 82],
        [0.15, 60],
        [0.25, 30],
      ],
      Math.abs(relative),
    ),
  );
}

function sleepDurationUtility(hours: number): number {
  return roundScore(
    linear(
      [
        [4, 20],
        [5, 38],
        [6, 62],
        [7, 84],
        [8, 96],
        [9, 91],
        [10, 75],
        [11, 55],
      ],
      hours,
    ),
  );
}

function sleepEfficiencyUtility(efficiencyPercent: number): number {
  return roundScore(
    linear(
      [
        [60, 35],
        [70, 52],
        [80, 72],
        [85, 84],
        [90, 94],
        [95, 100],
        [100, 100],
      ],
      efficiencyPercent,
    ),
  );
}

function stepsUtility(steps: number): number {
  return roundScore(
    linear(
      [
        [0, 10],
        [2000, 30],
        [4000, 50],
        [5000, 63],
        [7000, 84],
        [9000, 94],
        [11000, 100],
        [15000, 100],
      ],
      steps,
    ),
  );
}

function formatDecimal(value: number, decimals = 1): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(value));
}

function baselineCenter(signal: HealthBaselineSignal): number | null {
  return signal.median ?? signal.average;
}

function sourceFactorFor(health: HealthPageData): number {
  if (!health.sourceAvailable) return 0.2;
  return importFactor(health.today.kind);
}

function buildSleepScore(health: HealthPageData): HealthExplainableScore {
  const today = health.signals.today;
  const duration = today?.values.sleep ?? null;
  const inBed = today?.values.sleepInBed ?? null;
  const recentSleep = health.signals.recent.sleep;
  const baselineSleep = health.signals.baseline.sleep;
  const baseline = baselineCenter(baselineSleep);

  const durationScore = duration === null ? null : sleepDurationUtility(duration);
  const continuity =
    duration !== null && inBed !== null && inBed > 0
      ? clamp((duration / inBed) * 100, 0, 100)
      : null;
  const continuityScore = continuity === null ? null : sleepEfficiencyUtility(continuity);
  const recentAverage = recentSleep.average;
  const trendScore =
    recentAverage !== null && baseline !== null
      ? personalDeviationScore(recentAverage, baseline, 'lower-is-worse')
      : null;

  const contributors: WeightedContributor[] = [
    contributor({
      id: 'duration',
      label: 'Duración',
      score: durationScore,
      weight: 0.35,
      reliability: 'A',
      direction:
        durationScore === null
          ? 'unknown'
          : durationScore >= 80
            ? 'positive'
            : durationScore < 60
              ? 'negative'
              : 'neutral',
      detail:
        duration === null
          ? 'Sin duración de sueño utilizable hoy.'
          : `${formatDecimal(duration)} h de sueño total.`,
      evidenceRefs: ['sleep'],
    }),
    contributor({
      id: 'continuity',
      label: 'Continuidad',
      score: continuityScore,
      weight: 0.2,
      reliability: 'B',
      direction:
        continuityScore === null
          ? 'unknown'
          : continuityScore >= 80
            ? 'positive'
            : continuityScore < 60
              ? 'negative'
              : 'neutral',
      detail:
        continuity === null
          ? 'Sin tiempo-en-cama suficiente para estimar continuidad.'
          : `Aproximadamente ${formatInt(continuity)}% del tiempo en cama figura como sueño.`,
      evidenceRefs: ['sleep', 'sleepInBed'],
      baselineDays: health.signals.baseline.sleepInBed.days,
    }),
    contributor({
      id: 'recent-sleep',
      label: 'Tendencia reciente',
      score: trendScore,
      weight: 0.15,
      reliability: 'A',
      direction:
        trendScore === null
          ? 'unknown'
          : trendScore >= 80
            ? 'positive'
            : trendScore < 60
              ? 'negative'
              : 'neutral',
      detail:
        recentAverage === null || baseline === null
          ? 'Todavía no hay suficiente historial comparable.'
          : `Promedio 7d ${formatDecimal(recentAverage)} h vs base personal ${formatDecimal(
              baseline,
            )} h.`,
      evidenceRefs: ['sleep'],
      baselineDays: baselineSleep.days,
    }),
    contributor({
      id: 'regularity',
      label: 'Regularidad horaria',
      score: null,
      weight: 0.2,
      reliability: 'A',
      direction: 'unknown',
      detail: 'Pendiente de conservar inicio/fin exactos del sueño en el pipeline.',
      evidenceRefs: [],
      baselineDays: null,
    }),
    contributor({
      id: 'timing',
      label: 'Timing circadiano',
      score: null,
      weight: 0.1,
      reliability: 'A',
      direction: 'unknown',
      detail: 'Pendiente de horarios exactos y consistentes de sueño.',
      evidenceRefs: [],
      baselineDays: null,
    }),
  ];

  const aggregated = weightedAggregate(contributors, sourceFactorFor(health), 0.5);
  const delta =
    recentAverage !== null && baseline !== null && baseline !== 0
      ? (recentAverage - baseline) / baseline
      : null;

  return {
    id: 'sleep',
    label: 'Sueño',
    question: '¿Qué tan favorable fue tu patrón de sueño para recuperación y continuidad?',
    score: aggregated.score,
    band: bandFor(aggregated.score),
    confidence: aggregated.confidence,
    confidenceBand: confidenceBandFor(aggregated.confidence),
    personalPosition:
      recentAverage !== null && baseline !== null
        ? `7d ${delta !== null && delta >= 0 ? '+' : ''}${
            delta === null ? '—' : Math.round(delta * 100)
          }% vs tu base`
        : scorePosition(aggregated.score),
    trend: directionForDelta(delta),
    contributors,
    uncertainties: [
      ...(health.signals.baseline.sleep.days < STRONG_BASELINE_DAYS
        ? ['La base de sueño todavía no alcanzó 14 días válidos.']
        : []),
      'La regularidad y el timing siguen deshabilitados hasta conservar horarios exactos.',
      'Las etapas de sueño del wearable no dominan este score.',
    ],
    calculationVersion: SCORE_VERSION,
  };
}

function buildCardioScore(health: HealthPageData): HealthExplainableScore {
  const today = health.signals.today;
  const resting = today?.values.restingHr ?? null;
  const hrv = today?.values.hrv ?? null;
  const restingBaseline = health.signals.baseline.restingHr;
  const hrvBaseline = health.signals.baseline.hrv;
  const restingCenter = baselineCenter(restingBaseline);
  const hrvCenter = baselineCenter(hrvBaseline);

  const restingScore =
    resting !== null && restingCenter !== null
      ? personalDeviationScore(resting, restingCenter, 'higher-is-worse')
      : null;
  const hrvScore =
    hrv !== null && hrvCenter !== null
      ? personalDeviationScore(hrv, hrvCenter, 'lower-is-worse')
      : null;

  const contributors: WeightedContributor[] = [
    contributor({
      id: 'resting-hr',
      label: 'FC en reposo',
      score: restingScore,
      weight: 0.65,
      reliability: 'A',
      direction:
        restingScore === null
          ? 'unknown'
          : restingScore >= 80
            ? 'positive'
            : restingScore < 60
              ? 'negative'
              : 'neutral',
      detail:
        resting === null || restingCenter === null
          ? 'Sin comparación personal suficiente de FC en reposo.'
          : `${formatInt(resting)} ppm hoy vs base ${formatInt(restingCenter)} ppm.`,
      evidenceRefs: ['restingHr'],
      baselineDays: restingBaseline.days,
    }),
    contributor({
      id: 'hrv',
      label: 'HRV',
      score: hrvScore,
      weight: 0.35,
      reliability: 'A',
      direction:
        hrvScore === null
          ? 'unknown'
          : hrvScore >= 80
            ? 'positive'
            : hrvScore < 60
              ? 'negative'
              : 'neutral',
      detail:
        hrv === null || hrvCenter === null
          ? 'HRV no tiene cobertura/semántica suficiente para pesar hoy.'
          : `${formatInt(hrv)} ms hoy vs base ${formatInt(hrvCenter)} ms.`,
      evidenceRefs: ['hrv'],
      baselineDays: hrvBaseline.days,
    }),
  ];

  const aggregated = weightedAggregate(contributors, sourceFactorFor(health), 0.6);
  const rhrDelta =
    resting !== null && restingCenter !== null && restingCenter !== 0
      ? (resting - restingCenter) / restingCenter
      : null;

  return {
    id: 'cardio-stability',
    label: 'Estabilidad cardio',
    question: '¿Qué tan estables están tus señales cardiovasculares/autonómicas vs tu normal?',
    score: aggregated.score,
    band: bandFor(aggregated.score),
    confidence: aggregated.confidence,
    confidenceBand: confidenceBandFor(aggregated.confidence),
    personalPosition:
      resting !== null && restingCenter !== null
        ? `FC reposo ${rhrDelta !== null && rhrDelta > 0 ? '+' : ''}${
            rhrDelta === null ? '—' : Math.round(rhrDelta * 100)
          }% vs tu base`
        : scorePosition(aggregated.score),
    trend:
      rhrDelta === null ? 'unknown' : rhrDelta > 0.05 ? 'down' : rhrDelta < -0.05 ? 'up' : 'stable',
    contributors,
    uncertainties: [
      ...(hrvScore === null ? ['HRV no está aportando al score hoy; la confianza baja.'] : []),
      'No es un puntaje de riesgo cardiovascular ni una interpretación clínica.',
    ],
    calculationVersion: SCORE_VERSION,
  };
}

function buildActivityScore(health: HealthPageData): HealthExplainableScore {
  const recent = health.signals.recent.steps;
  const baseline = health.signals.baseline.steps;
  const recentSteps = recent.average;
  const baselineSteps = baselineCenter(baseline);
  const absoluteScore = recentSteps === null ? null : stepsUtility(recentSteps);
  const personalScore =
    recentSteps !== null && baselineSteps !== null
      ? personalDeviationScore(recentSteps, baselineSteps, 'lower-is-worse')
      : null;

  const contributors: WeightedContributor[] = [
    contributor({
      id: 'steps-dose-response',
      label: 'Movimiento reciente',
      score: absoluteScore,
      weight: 0.7,
      reliability: 'A',
      direction:
        absoluteScore === null
          ? 'unknown'
          : absoluteScore >= 80
            ? 'positive'
            : absoluteScore < 60
              ? 'negative'
              : 'neutral',
      detail:
        recentSteps === null
          ? 'Sin pasos suficientes en los últimos 7 días.'
          : `Promedio reciente: ${formatInt(recentSteps)} pasos/día.`,
      evidenceRefs: ['steps'],
      baselineDays: recent.days,
    }),
    contributor({
      id: 'steps-personal',
      label: 'Vs tu patrón',
      score: personalScore,
      weight: 0.3,
      reliability: 'A',
      direction:
        personalScore === null
          ? 'unknown'
          : personalScore >= 80
            ? 'positive'
            : personalScore < 60
              ? 'negative'
              : 'neutral',
      detail:
        recentSteps === null || baselineSteps === null
          ? 'Sin base personal suficiente para comparar movimiento.'
          : `7d ${formatInt(recentSteps)} vs base ${formatInt(baselineSteps)} pasos/día.`,
      evidenceRefs: ['steps'],
      baselineDays: baseline.days,
    }),
  ];

  const coverageFactor = clamp(recent.days / health.signals.recentWindowDays);
  const aggregated = weightedAggregate(
    contributors,
    Math.min(sourceFactorFor(health), coverageFactor || 0.25),
    0.6,
  );
  const delta =
    recentSteps !== null && baselineSteps !== null && baselineSteps !== 0
      ? (recentSteps - baselineSteps) / baselineSteps
      : null;

  return {
    id: 'activity',
    label: 'Actividad',
    question: '¿Qué tan fuerte y consistente fue tu movimiento reciente?',
    score: aggregated.score,
    band: bandFor(aggregated.score),
    confidence: aggregated.confidence,
    confidenceBand: confidenceBandFor(aggregated.confidence),
    personalPosition:
      recentSteps !== null && baselineSteps !== null
        ? `${delta !== null && delta >= 0 ? '+' : ''}${
            delta === null ? '—' : Math.round(delta * 100)
          }% vs tu base de pasos`
        : scorePosition(aggregated.score),
    trend: directionForDelta(delta, 0.08),
    contributors,
    uncertainties: [
      'No usa 10.000 pasos como aprobado/reprobado universal.',
      'Las calorías activas quedan como contexto de baja confianza y no dominan el score.',
    ],
    calculationVersion: SCORE_VERSION,
  };
}

function buildMobilityScore(health: HealthPageData): HealthExplainableScore {
  const definitions: readonly {
    id: string;
    label: string;
    signal: Extract<HealthSignalId, 'walkingSpeed' | 'stepLengthCm' | 'walkingAsymmetry'>;
    weight: number;
    direction: 'lower-is-worse' | 'higher-is-worse' | 'symmetric';
    unit: string;
  }[] = [
    {
      id: 'walking-speed',
      label: 'Velocidad al caminar',
      signal: 'walkingSpeed',
      weight: 0.5,
      direction: 'lower-is-worse',
      unit: 'km/h',
    },
    {
      id: 'step-length',
      label: 'Longitud de paso',
      signal: 'stepLengthCm',
      weight: 0.3,
      direction: 'lower-is-worse',
      unit: 'cm',
    },
    {
      id: 'asymmetry',
      label: 'Asimetría',
      signal: 'walkingAsymmetry',
      weight: 0.2,
      direction: 'higher-is-worse',
      unit: '%',
    },
  ];

  const contributors = definitions.map((definition): WeightedContributor => {
    const recent = health.signals.recent[definition.signal];
    const baseline = health.signals.baseline[definition.signal];
    const recentValue = recent.median ?? recent.average;
    const baselineValue = baselineCenter(baseline);
    const score =
      recentValue !== null && baselineValue !== null && baseline.days >= 5
        ? personalDeviationScore(recentValue, baselineValue, definition.direction)
        : null;

    return contributor({
      id: definition.id,
      label: definition.label,
      score,
      weight: definition.weight,
      reliability: 'B',
      direction:
        score === null ? 'unknown' : score >= 80 ? 'positive' : score < 60 ? 'negative' : 'neutral',
      detail:
        recentValue === null || baselineValue === null
          ? 'Sin historial comparable suficiente.'
          : `7d ${formatDecimal(recentValue)} ${definition.unit} vs base ${formatDecimal(
              baselineValue,
            )} ${definition.unit}.`,
      evidenceRefs: [definition.signal],
      baselineDays: Math.min(recent.days, baseline.days),
    });
  });

  const aggregated = weightedAggregate(contributors, sourceFactorFor(health), 0.5);
  const speedRecent = health.signals.recent.walkingSpeed.median;
  const speedBase = baselineCenter(health.signals.baseline.walkingSpeed);
  const speedDelta =
    speedRecent !== null && speedBase !== null && speedBase !== 0
      ? (speedRecent - speedBase) / speedBase
      : null;

  return {
    id: 'mobility',
    label: 'Movilidad',
    question: '¿Qué tan estable está tu patrón de marcha respecto de tu propia historia?',
    score: aggregated.score,
    band: bandFor(aggregated.score),
    confidence: aggregated.confidence,
    confidenceBand: confidenceBandFor(aggregated.confidence),
    personalPosition: scorePosition(aggregated.score),
    trend: directionForDelta(speedDelta, 0.05),
    contributors,
    uncertainties: [
      'Se interpreta principalmente contra tu propia historia, no contra umbrales de poblaciones clínicas.',
      'Es un score lento: importa más la persistencia que una variación de un solo día.',
    ],
    calculationVersion: SCORE_VERSION,
  };
}

function buildRecoveryScore(
  health: HealthPageData,
  sleep: HealthExplainableScore,
  cardio: HealthExplainableScore,
): HealthExplainableScore {
  const contributors: WeightedContributor[] = [
    contributor({
      id: 'sleep-domain',
      label: 'Sueño',
      score: sleep.score,
      weight: 0.45,
      reliability: 'A',
      direction:
        sleep.score === null
          ? 'unknown'
          : sleep.score >= 80
            ? 'positive'
            : sleep.score < 60
              ? 'negative'
              : 'neutral',
      detail:
        sleep.score === null
          ? 'Sueño insuficiente para puntuar.'
          : `Sleep Score ${sleep.score}/100 (confianza ${sleep.confidence}%).`,
      evidenceRefs: ['sleep', 'sleepInBed'],
      baselineDays: health.signals.baseline.sleep.days,
    }),
    contributor({
      id: 'autonomic-domain',
      label: 'Señales cardio/autonómicas',
      score: cardio.score,
      weight: 0.45,
      reliability: 'A',
      direction:
        cardio.score === null
          ? 'unknown'
          : cardio.score >= 80
            ? 'positive'
            : cardio.score < 60
              ? 'negative'
              : 'neutral',
      detail:
        cardio.score === null
          ? 'Sin base cardio suficiente para recuperación.'
          : `Estabilidad cardio ${cardio.score}/100 (confianza ${cardio.confidence}%).`,
      evidenceRefs: ['restingHr', 'hrv'],
      baselineDays: health.signals.baseline.restingHr.days,
    }),
    contributor({
      id: 'gym-load',
      label: 'Carga de entrenamiento',
      score: null,
      weight: 0.1,
      reliability: 'B',
      direction: 'unknown',
      detail: 'Pendiente de un resumen estructurado de carga/RPE desde Gym Intelligence.',
      evidenceRefs: [],
      baselineDays: null,
    }),
  ];

  const aggregated = weightedAggregate(contributors, sourceFactorFor(health), 0.7);
  const domainScores = [sleep.score, cardio.score].filter(
    (score): score is number => score !== null,
  );
  const position =
    domainScores.length === 2
      ? `Sueño ${sleep.score}/100 · cardio ${cardio.score}/100`
      : scorePosition(aggregated.score);

  return {
    id: 'recovery',
    label: 'Recuperación',
    question: '¿Qué tan recuperado parece tu cuerpo respecto de su patrón reciente?',
    score: aggregated.score,
    band: bandFor(aggregated.score),
    confidence: aggregated.confidence,
    confidenceBand: confidenceBandFor(aggregated.confidence),
    personalPosition: position,
    trend:
      sleep.trend === 'down' || cardio.trend === 'down'
        ? 'down'
        : sleep.trend === 'up' && cardio.trend === 'up'
          ? 'up'
          : sleep.trend === 'unknown' && cardio.trend === 'unknown'
            ? 'unknown'
            : 'stable',
    contributors,
    uncertainties: [
      'La carga de entrenamiento todavía no pesa hasta tener un resumen estructurado de Gym.',
      ...(health.signals.today?.values.hrv === null ||
      health.signals.today?.values.hrv === undefined
        ? ['HRV ausente: el score sigue visible, pero pierde confianza.']
        : []),
    ],
    calculationVersion: SCORE_VERSION,
  };
}

function buildReadinessScore(
  sleep: HealthExplainableScore,
  cardio: HealthExplainableScore,
  recovery: HealthExplainableScore,
): HealthExplainableScore {
  const hasCore = sleep.score !== null && cardio.score !== null;
  const score = hasCore
    ? roundScore(Math.sqrt((sleep.score as number) * (cardio.score as number)))
    : null;
  const confidence = hasCore
    ? roundScore(Math.sqrt(sleep.confidence * cardio.confidence) * 0.9)
    : roundScore(Math.sqrt(Math.max(sleep.confidence, 1) * Math.max(cardio.confidence, 1)) * 0.55);

  const contributors: HealthScoreContributor[] = [
    {
      id: 'sleep-domain',
      label: 'Sueño',
      score: sleep.score,
      weight: 0.5,
      reliability: 'A',
      direction:
        sleep.score === null
          ? 'unknown'
          : sleep.score >= 80
            ? 'positive'
            : sleep.score < 60
              ? 'negative'
              : 'neutral',
      detail: sleep.score === null ? 'Sin Sleep Score suficiente.' : `${sleep.score}/100.`,
      evidenceRefs: ['sleep', 'sleepInBed'],
    },
    {
      id: 'cardio-domain',
      label: 'Estabilidad cardio',
      score: cardio.score,
      weight: 0.5,
      reliability: 'A',
      direction:
        cardio.score === null
          ? 'unknown'
          : cardio.score >= 80
            ? 'positive'
            : cardio.score < 60
              ? 'negative'
              : 'neutral',
      detail: cardio.score === null ? 'Sin señal cardio suficiente.' : `${cardio.score}/100.`,
      evidenceRefs: ['restingHr', 'hrv'],
    },
  ];

  return {
    id: 'readiness',
    label: 'Readiness',
    question: '¿Cuánta capacidad fisiológica respalda la evidencia disponible para hoy?',
    score,
    band: bandFor(score),
    confidence,
    confidenceBand: confidenceBandFor(confidence),
    personalPosition:
      score === null
        ? 'Faltan dominios núcleo para un readiness defendible'
        : `Combinación limitada por el dominio más débil · Recovery ${recovery.score ?? '—'}/100`,
    trend:
      sleep.trend === 'down' || cardio.trend === 'down'
        ? 'down'
        : sleep.trend === 'up' && cardio.trend === 'up'
          ? 'up'
          : sleep.trend === 'unknown' && cardio.trend === 'unknown'
            ? 'unknown'
            : 'stable',
    contributors,
    uncertainties: [
      'El agregado usa media geométrica para limitar compensación entre dominios.',
      'Carga Gym y check-in subjetivo todavía no están incorporados al Readiness.',
      'No representa probabilidad de estar sano ni aptitud médica para entrenar.',
    ],
    calculationVersion: SCORE_VERSION,
  };
}

function momentumContributor(
  id: string,
  label: string,
  recent: HealthBaselineSignal,
  baseline: HealthBaselineSignal,
  direction: 'higher-better' | 'lower-better',
  refs: readonly HealthSignalId[],
): WeightedContributor {
  const recentValue = recent.average;
  const baselineValue = baselineCenter(baseline);
  let score: number | null = null;
  let delta: number | null = null;
  if (recentValue !== null && baselineValue !== null && baselineValue !== 0) {
    delta = (recentValue - baselineValue) / Math.abs(baselineValue);
    const signed = direction === 'higher-better' ? delta : -delta;
    score = roundScore(
      linear(
        [
          [-0.25, 10],
          [-0.12, 28],
          [-0.05, 42],
          [0, 50],
          [0.05, 60],
          [0.12, 78],
          [0.25, 95],
        ],
        signed,
      ),
    );
  }

  return contributor({
    id,
    label,
    score,
    weight: 0.25,
    reliability: refs.includes('walkingSpeed') ? 'B' : 'A',
    direction:
      score === null ? 'unknown' : score >= 60 ? 'positive' : score <= 40 ? 'negative' : 'neutral',
    detail:
      recentValue === null || baselineValue === null
        ? 'Sin historial comparable suficiente.'
        : `7d ${formatDecimal(recentValue)} vs base ${formatDecimal(baselineValue)}.`,
    evidenceRefs: refs,
    baselineDays: Math.min(recent.days, baseline.days),
  });
}

function buildMomentum(health: HealthPageData): HealthMomentum {
  const contributors: WeightedContributor[] = [
    momentumContributor(
      'sleep-trend',
      'Sueño',
      health.signals.recent.sleep,
      health.signals.baseline.sleep,
      'higher-better',
      ['sleep'],
    ),
    momentumContributor(
      'activity-trend',
      'Actividad',
      health.signals.recent.steps,
      health.signals.baseline.steps,
      'higher-better',
      ['steps'],
    ),
    momentumContributor(
      'resting-hr-trend',
      'FC reposo',
      health.signals.recent.restingHr,
      health.signals.baseline.restingHr,
      'lower-better',
      ['restingHr'],
    ),
    momentumContributor(
      'mobility-trend',
      'Movilidad',
      health.signals.recent.walkingSpeed,
      health.signals.baseline.walkingSpeed,
      'higher-better',
      ['walkingSpeed'],
    ),
  ];
  const aggregated = weightedAggregate(contributors, sourceFactorFor(health), 0.5);
  const score = aggregated.score;
  const direction =
    score === null
      ? 'insufficient'
      : score >= 58
        ? 'improving'
        : score <= 42
          ? 'declining'
          : 'stable';

  return {
    score,
    direction,
    confidence: aggregated.confidence,
    detail:
      score === null
        ? 'Falta historia comparable en al menos dos dominios.'
        : '50 representa estabilidad aproximada; el índice resume dirección reciente, no “salud total”.',
    contributors,
    calculationVersion: MOMENTUM_VERSION,
  };
}

export function buildExplainableHealthScores(health: HealthPageData): HealthScoreboard {
  const sleep = buildSleepScore(health);
  const cardio = buildCardioScore(health);
  const activity = buildActivityScore(health);
  const mobility = buildMobilityScore(health);
  const recovery = buildRecoveryScore(health, sleep, cardio);
  const readiness = buildReadinessScore(sleep, cardio, recovery);

  return {
    readiness,
    domains: [sleep, recovery, activity, cardio, mobility],
    momentum: buildMomentum(health),
  };
}
