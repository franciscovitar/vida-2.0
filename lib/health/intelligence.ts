/**
 * Health Intelligence V1.
 *
 * Capa determinística y pura que traduce la telemetría personal de salud a una
 * lectura entendible: estado actual, trayectoria, qué cambió, contexto de otros
 * dominios y prioridades. No contiene lógica de presentación ni llamadas de red.
 *
 * Límites explícitos del producto:
 * - No es un sistema de diagnóstico médico ni un puntaje universal de readiness.
 * - No existe un score 0–100 ni una suma ponderada opaca.
 * - Un faltante es desconocido, nunca cero.
 * - Una coincidencia temporal es contexto, nunca una causa.
 */
import {
  HEALTH_SOURCE_UNAVAILABLE_DETAIL,
  HEALTH_SOURCE_UNAVAILABLE_TITLE,
} from '@/lib/adapters/salud-period';
import { formatNumber } from '@/lib/format';
import type { GymSessionsSnapshot } from '@/lib/gym/sheets-sessions-port';
import type { NutritionCoverage, NutritionDashboardData } from '@/lib/nutrition/types';
import type {
  HealthDaySignals,
  HealthImportKind,
  HealthInsight,
  HealthMetricPeriod,
  HealthPageData,
  HealthSignalId,
} from '@/types/domain-pages';

/* ------------------------------------------------------------------ */
/* Umbrales de monitoreo personal                                      */
/* ------------------------------------------------------------------ */

/** Señales con umbral de monitoreo definido. */
export type HealthMonitoredSignal = Extract<
  HealthSignalId,
  'sleep' | 'restingHr' | 'hrv' | 'steps' | 'activeCalories' | 'spo2'
>;

export interface HealthMonitoringThreshold {
  label: string;
  /** Dirección desfavorable respecto de la base personal. */
  concernDirection: 'below' | 'above';
  /** Desviación relativa que se considera cambio material. */
  materialRelative: number;
  /** Desviación relativa mínima para siquiera nombrar el cambio. */
  mildRelative: number;
  /** Desviación absoluta mínima; evita que el redondeo genere señales falsas. */
  minAbsolute: number;
  /** Días con dato necesarios en la base personal para poder comparar. */
  minBaselineDays: number;
}

/**
 * Umbrales de monitoreo personal, NO puntos de corte clínicos.
 * Son heurísticas transparentes sobre la propia base reciente de la persona y
 * están centralizadas acá para poder testear sus bordes exactos.
 */
export const HEALTH_MONITORING_THRESHOLDS: Readonly<
  Record<HealthMonitoredSignal, HealthMonitoringThreshold>
> = {
  sleep: {
    label: 'Sueño total',
    concernDirection: 'below',
    materialRelative: 0.12,
    mildRelative: 0.06,
    minAbsolute: 0.4,
    minBaselineDays: 5,
  },
  restingHr: {
    label: 'FC en reposo',
    concernDirection: 'above',
    materialRelative: 0.07,
    mildRelative: 0.035,
    minAbsolute: 3,
    minBaselineDays: 5,
  },
  hrv: {
    label: 'HRV',
    concernDirection: 'below',
    materialRelative: 0.15,
    mildRelative: 0.08,
    minAbsolute: 3,
    minBaselineDays: 7,
  },
  steps: {
    label: 'Pasos',
    concernDirection: 'below',
    materialRelative: 0.3,
    mildRelative: 0.15,
    minAbsolute: 800,
    minBaselineDays: 5,
  },
  activeCalories: {
    label: 'Calorías activas',
    concernDirection: 'below',
    materialRelative: 0.3,
    mildRelative: 0.15,
    minAbsolute: 80,
    minBaselineDays: 5,
  },
  spo2: {
    label: 'SpO₂',
    concernDirection: 'below',
    materialRelative: 0.02,
    mildRelative: 0.01,
    minAbsolute: 1,
    minBaselineDays: 7,
  },
};

/**
 * Señales núcleo que pueden sostener una lectura del día.
 * HRV participa sólo si hay suficientes días comparables; su ausencia nunca bloquea.
 */
export const HEALTH_CORE_SIGNALS: readonly HealthMonitoredSignal[] = ['sleep', 'restingHr', 'hrv'];

/** Señales que sólo aportan contexto y jamás determinan el estado del día. */
export const HEALTH_CONTEXT_SIGNALS: readonly HealthMonitoredSignal[] = [
  'steps',
  'activeCalories',
  'spo2',
];

/** Señales núcleo cuya falta se informa explícitamente (HRV queda fuera a propósito). */
const REPORTED_CORE_SIGNALS: readonly HealthMonitoredSignal[] = ['sleep', 'restingHr'];

/** Máximo de prioridades mostradas a la vez. */
export const HEALTH_MAX_PRIORITIES = 3;

/** Máximo de observaciones en "Qué cambió". */
export const HEALTH_MAX_CHANGES = 4;

/** Días de base personal a partir de los cuales la lectura deja de ser limitada. */
export const HEALTH_BASELINE_MIN_DAYS = 5;

/** Días de base personal a partir de los cuales la lectura se considera sólida. */
export const HEALTH_BASELINE_STRONG_DAYS = 12;

/** Aclaración obligatoria en todo cruce entre dominios. */
export const HEALTH_CONTEXT_CAVEAT =
  'Coincidencia temporal del mismo período, no una relación demostrada entre dominios.';

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

function formatDecimal(value: number, decimals = 1): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatSignalValue(signal: HealthMonitoredSignal, value: number): string {
  if (signal === 'sleep') return `${formatDecimal(value)} h`;
  if (signal === 'restingHr') return `${formatNumber(Math.round(value))} ppm`;
  if (signal === 'hrv') return `${formatNumber(Math.round(value))} ms`;
  if (signal === 'steps') return formatNumber(Math.round(value));
  if (signal === 'activeCalories') return `${formatNumber(Math.round(value))} kcal`;
  return `${formatDecimal(value)} %`;
}

function percentLabel(relative: number): string {
  return `${Math.round(Math.abs(relative) * 100)} %`;
}

function joinEs(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

function lowerEs(value: string): string {
  return value.toLocaleLowerCase('es');
}

/* ------------------------------------------------------------------ */
/* Evidencia por señal                                                 */
/* ------------------------------------------------------------------ */

export type HealthDeviationDirection = 'above' | 'below' | 'stable' | 'unknown';
export type HealthDeviationMateriality = 'material' | 'mild' | 'none' | 'unknown';

export interface HealthSignalEvidence {
  signal: HealthMonitoredSignal;
  label: string;
  role: 'core' | 'context';
  /** null = desconocido. Nunca 0 por ausencia. */
  value: number | null;
  valueLabel: string;
  baselineAverage: number | null;
  baselineLabel: string;
  baselineDays: number;
  deltaAbsolute: number | null;
  deltaRelative: number | null;
  direction: HealthDeviationDirection;
  materiality: HealthDeviationMateriality;
  /** Desviación material en la dirección desfavorable para esa señal. */
  concern: boolean;
  /** Dato observado más comparación personal, sin conclusión clínica. */
  text: string;
}

interface Classification {
  direction: HealthDeviationDirection;
  materiality: HealthDeviationMateriality;
  relative: number;
}

function classify(
  value: number,
  baseline: number,
  threshold: HealthMonitoringThreshold,
): Classification {
  const deltaAbsolute = value - baseline;
  const relative = baseline === 0 ? 0 : deltaAbsolute / Math.abs(baseline);
  if (Math.abs(deltaAbsolute) < threshold.minAbsolute) {
    return { direction: 'stable', materiality: 'none', relative };
  }
  const magnitude = Math.abs(relative);
  const direction: HealthDeviationDirection = deltaAbsolute > 0 ? 'above' : 'below';
  if (magnitude >= threshold.materialRelative) {
    return { direction, materiality: 'material', relative };
  }
  if (magnitude >= threshold.mildRelative) return { direction, materiality: 'mild', relative };
  return { direction: 'stable', materiality: 'none', relative };
}

function evidenceText(input: {
  signal: HealthMonitoredSignal;
  label: string;
  valueLabel: string;
  baselineLabel: string;
  direction: HealthDeviationDirection;
  materiality: HealthDeviationMateriality;
  relative: number | null;
}): string {
  const { signal, label, valueLabel, baselineLabel, direction, materiality } = input;
  if (materiality === 'unknown') {
    if (valueLabel === '—') return `${label}: sin dato en el registro de hoy.`;
    return `${label}: ${valueLabel}. Todavía no hay base personal suficiente para compararlo.`;
  }
  if (materiality === 'none') {
    return `${label}: ${valueLabel}, dentro de tu rango habitual (base ${baselineLabel}).`;
  }
  const side = direction === 'above' ? 'por encima' : 'por debajo';
  const intensity = materiality === 'material' ? '' : 'levemente ';
  const base = `${label}: ${valueLabel}, ${intensity}${percentLabel(input.relative ?? 0)} ${side} de tu base reciente (${baselineLabel}).`;
  if (signal === 'spo2') return `${base} Esta vista no lo interpreta clínicamente.`;
  return base;
}

function buildSignalEvidence(
  signal: HealthMonitoredSignal,
  day: HealthDaySignals | null,
  baseline: { average: number | null; days: number },
): HealthSignalEvidence {
  const threshold = HEALTH_MONITORING_THRESHOLDS[signal];
  const value = day?.values[signal] ?? null;
  const average = baseline.average;

  const classification: Classification | null =
    value !== null && average !== null && baseline.days >= threshold.minBaselineDays
      ? classify(value, average, threshold)
      : null;

  const valueLabel = value === null ? '—' : formatSignalValue(signal, value);
  const baselineLabel = average === null ? '—' : formatSignalValue(signal, average);
  const direction = classification?.direction ?? 'unknown';
  const materiality = classification?.materiality ?? 'unknown';
  const relative = classification?.relative ?? null;

  return {
    signal,
    label: threshold.label,
    role: HEALTH_CORE_SIGNALS.includes(signal) ? 'core' : 'context',
    value,
    valueLabel,
    baselineAverage: average,
    baselineLabel,
    baselineDays: baseline.days,
    deltaAbsolute:
      classification !== null && value !== null && average !== null ? value - average : null,
    deltaRelative: relative,
    direction,
    materiality,
    concern: materiality === 'material' && direction === threshold.concernDirection,
    text: evidenceText({
      signal,
      label: threshold.label,
      valueLabel,
      baselineLabel,
      direction,
      materiality,
      relative,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Estado actual                                                       */
/* ------------------------------------------------------------------ */

export type HealthStateKind = 'normal-for-you' | 'watch' | 'below-usual' | 'insufficient-data';

export interface HealthLastInterpretableDay {
  date: string;
  label: string;
  summary: string;
}

export interface HealthCurrentState {
  kind: HealthStateKind;
  /** false cuando la fuente real falló: no hay lectura personal posible. */
  sourceAvailable: boolean;
  headline: string;
  explanation: string;
  reasons: readonly string[];
  /** Siempre el día de hoy: nunca se sustituye por un día anterior más completo. */
  date: string;
  dateLabel: string;
  importKind: HealthImportKind | 'missing';
  coreAvailable: readonly string[];
  coreMissing: readonly string[];
  evidence: readonly HealthSignalEvidence[];
  /** Referencia histórica explícita, sólo cuando hoy no alcanza para interpretar. */
  lastInterpretable: HealthLastInterpretableDay | null;
}

const STATE_HEADLINES: Readonly<Record<HealthStateKind, string>> = {
  'normal-for-you': 'Dentro de tu rango habitual',
  watch: 'Hay algo para vigilar',
  'below-usual': 'Varias señales están por debajo de tu normal',
  'insufficient-data': 'No hay datos suficientes hoy',
};

function movementPresent(day: HealthDaySignals | null): boolean {
  if (!day) return false;
  return (
    day.values.steps !== null || day.values.activeCalories !== null || day.values.walkRunKm !== null
  );
}

function lastInterpretableSummary(day: HealthDaySignals): string {
  const parts: string[] = [];
  if (day.values.sleep !== null)
    parts.push(`sueño ${formatSignalValue('sleep', day.values.sleep)}`);
  if (day.values.restingHr !== null) {
    parts.push(`FC en reposo ${formatSignalValue('restingHr', day.values.restingHr)}`);
  }
  const detail = parts.length > 0 ? ` (${joinEs(parts)})` : '';
  return `Último día interpretable: ${day.label}${detail}. Es historial, no el estado de hoy.`;
}

function partialImportReason(day: HealthDaySignals | null): string {
  const missing = day?.missingCore ? ` (faltan: ${day.missingCore})` : '';
  return `La fuente marcó la importación de hoy como parcial${missing}.`;
}

/**
 * Estado cuando la fuente real está configurada pero no se pudo leer.
 * No hay día de hoy, ni base personal, ni día histórico interpretable: la
 * ausencia se informa como ausencia y nunca se rellena con historial simulado.
 */
function unavailableState(health: HealthPageData): HealthCurrentState {
  const reasons = [
    HEALTH_SOURCE_UNAVAILABLE_DETAIL,
    'No se muestran métricas del día, base personal, tendencias ni prioridades: no hay dato real que interpretar.',
  ];
  return {
    kind: 'insufficient-data',
    sourceAvailable: false,
    headline: HEALTH_SOURCE_UNAVAILABLE_TITLE,
    explanation: reasons.join(' '),
    reasons,
    date: health.targetDate,
    dateLabel: '',
    importKind: 'missing',
    coreAvailable: [],
    coreMissing: REPORTED_CORE_SIGNALS.map((signal) => HEALTH_MONITORING_THRESHOLDS[signal].label),
    evidence: [],
    lastInterpretable: null,
  };
}

function buildCurrentState(
  health: HealthPageData,
  evidence: readonly HealthSignalEvidence[],
): HealthCurrentState {
  if (!health.sourceAvailable) return unavailableState(health);

  const { signals, targetDate } = health;
  const today = signals.today;
  const importKind: HealthImportKind | 'missing' = today?.importKind ?? 'missing';

  const reportedCore = REPORTED_CORE_SIGNALS.map((signal) => ({
    label: HEALTH_MONITORING_THRESHOLDS[signal].label,
    present: (today?.values[signal] ?? null) !== null,
  }));
  const coreAvailable = reportedCore.filter((item) => item.present).map((item) => item.label);
  const coreMissing = reportedCore.filter((item) => !item.present).map((item) => item.label);

  const comparable = evidence.filter(
    (item) => item.role === 'core' && item.materiality !== 'unknown',
  );
  const concerns = comparable.filter((item) => item.concern);

  const historical =
    signals.lastInterpretable && signals.lastInterpretable.date !== targetDate
      ? {
          date: signals.lastInterpretable.date,
          label: signals.lastInterpretable.label,
          summary: lastInterpretableSummary(signals.lastInterpretable),
        }
      : null;

  const reasons: string[] = [];

  if (comparable.length === 0) {
    if (!today) {
      reasons.push('Todavía no hay ninguna fila de salud para hoy.');
    } else if (coreMissing.length > 0) {
      reasons.push(
        `No hay datos suficientes para valorar recuperación hoy: falta${coreMissing.length > 1 ? 'n' : ''} ${joinEs(coreMissing.map(lowerEs))}.`,
      );
    }
    if (movementPresent(today)) {
      reasons.push(
        'Hay datos de movimiento del día, pero el movimiento por sí solo no permite concluir nada sobre recuperación.',
      );
    }
    if (coreAvailable.length > 0) {
      reasons.push(
        `Hay ${joinEs(coreAvailable.map(lowerEs))}, pero todavía no hay base personal suficiente (${signals.baselineCoverageDays} día(s) con datos en los últimos ${signals.baselineWindowDays}) para comparar.`,
      );
    }
    if (importKind === 'partial') reasons.push(partialImportReason(today));

    return {
      kind: 'insufficient-data',
      sourceAvailable: true,
      headline: STATE_HEADLINES['insufficient-data'],
      explanation: reasons.join(' '),
      reasons,
      date: targetDate,
      dateLabel: today?.label ?? '',
      importKind,
      coreAvailable,
      coreMissing,
      evidence,
      lastInterpretable: historical,
    };
  }

  const kind: HealthStateKind =
    concerns.length >= 2 ? 'below-usual' : concerns.length === 1 ? 'watch' : 'normal-for-you';

  if (kind === 'normal-for-you') {
    reasons.push('Las señales disponibles están dentro de tu rango personal reciente.');
  } else {
    for (const item of concerns) reasons.push(item.text);
    reasons.push(
      kind === 'watch'
        ? 'Es una sola señal desviada: alcanza para volver a mirarla mañana, no para hablar de recuperación comprometida.'
        : 'Varias señales personales se movieron a la vez en la dirección desfavorable.',
    );
  }

  if (coreMissing.length > 0) {
    reasons.push(`La lectura es parcial: hoy falta ${joinEs(coreMissing.map(lowerEs))}.`);
  }
  if (importKind === 'partial') reasons.push(partialImportReason(today));

  return {
    kind,
    sourceAvailable: true,
    headline: STATE_HEADLINES[kind],
    explanation: reasons.join(' '),
    reasons,
    date: targetDate,
    dateLabel: today?.label ?? '',
    importKind,
    coreAvailable,
    coreMissing,
    evidence,
    lastInterpretable: coreMissing.length > 0 ? historical : null,
  };
}

/* ------------------------------------------------------------------ */
/* Trayectoria                                                         */
/* ------------------------------------------------------------------ */

export interface HealthTrajectoryItem {
  id: string;
  label: string;
  summary: string;
  direction: 'up' | 'down' | 'steady' | 'unknown';
  tone: 'neutral' | 'positive' | 'watch';
  currentLabel: string;
  previousLabel: string;
  coverageDays: number;
  /** true cuando el cambio supera el umbral leve de esa métrica. */
  material: boolean;
}

export interface HealthTrajectory {
  headline: string;
  detail: string;
  items: readonly HealthTrajectoryItem[];
}

const TRAJECTORY_SIGNALS: readonly { metricId: string; signal: HealthMonitoredSignal }[] = [
  { metricId: 'sleep', signal: 'sleep' },
  { metricId: 'restingHr', signal: 'restingHr' },
  { metricId: 'steps', signal: 'steps' },
];

function trajectoryItem(
  metric: HealthMetricPeriod,
  signal: HealthMonitoredSignal,
): HealthTrajectoryItem {
  const threshold = HEALTH_MONITORING_THRESHOLDS[signal];
  const current = metric.average;
  const previous = metric.previousAverage;
  const currentLabel = current === null ? '—' : formatSignalValue(signal, current);
  const previousLabel = previous === null ? '—' : formatSignalValue(signal, previous);

  if (current === null || previous === null || previous === 0) {
    return {
      id: metric.id,
      label: metric.label,
      summary: `${metric.label}: ${currentLabel} en el período. Todavía no hay período anterior comparable.`,
      direction: 'unknown',
      tone: 'neutral',
      currentLabel,
      previousLabel,
      coverageDays: metric.coverageDays,
      material: false,
    };
  }

  const relative = (current - previous) / Math.abs(previous);
  const material =
    Math.abs(relative) >= threshold.mildRelative &&
    Math.abs(current - previous) >= threshold.minAbsolute;

  if (!material) {
    return {
      id: metric.id,
      label: metric.label,
      summary: `${metric.label}: ${currentLabel}, estable frente al período anterior (${previousLabel}).`,
      direction: 'steady',
      tone: 'neutral',
      currentLabel,
      previousLabel,
      coverageDays: metric.coverageDays,
      material: false,
    };
  }

  const direction = relative > 0 ? 'up' : 'down';
  const unfavourable =
    (threshold.concernDirection === 'below' && direction === 'down') ||
    (threshold.concernDirection === 'above' && direction === 'up');

  return {
    id: metric.id,
    label: metric.label,
    summary: `${metric.label}: ${currentLabel}, ${percentLabel(relative)} ${direction === 'up' ? 'más' : 'menos'} que el período anterior (${previousLabel}).`,
    direction,
    tone: unfavourable ? 'watch' : 'positive',
    currentLabel,
    previousLabel,
    coverageDays: metric.coverageDays,
    material: true,
  };
}

function coverageItem(health: HealthPageData): HealthTrajectoryItem {
  const current = health.availableDays;
  const previous = health.previousAvailableDays;
  const partial = health.partialDays > 0 ? ` ${health.partialDays} con importación parcial.` : '';
  return {
    id: 'coverage',
    label: 'Cobertura de datos',
    summary: `${current} de ${health.periodDays} días con datos (antes ${previous}).${partial}`,
    direction: current > previous ? 'up' : current < previous ? 'down' : 'steady',
    tone: current < previous ? 'watch' : 'neutral',
    currentLabel: `${current}/${health.periodDays} días`,
    previousLabel: `${previous}/${health.periodDays} días`,
    coverageDays: current,
    material: Math.abs(current - previous) >= 2,
  };
}

function buildTrajectory(health: HealthPageData): HealthTrajectory {
  if (!health.sourceAvailable) {
    return {
      headline: 'Sin trayectoria: no hay lectura real del período.',
      detail: `${HEALTH_SOURCE_UNAVAILABLE_DETAIL} No se compara ningún período contra otro mientras la fuente no responda.`,
      items: [],
    };
  }

  const items: HealthTrajectoryItem[] = [];
  for (const entry of TRAJECTORY_SIGNALS) {
    const metric = health.metrics.find((candidate) => candidate.id === entry.metricId);
    if (!metric || metric.coverageDays === 0) continue;
    items.push(trajectoryItem(metric, entry.signal));
  }
  items.push(coverageItem(health));

  const leading = items.find((item) => item.material && item.id !== 'coverage');
  return {
    headline: leading
      ? `Cambio principal del período: ${lowerEs(leading.label)}.`
      : 'Sin cambios materiales en el período.',
    detail: `Comparación personal: ${health.periodDays} días actuales frente al período anterior equivalente y a tu base de ${health.signals.baselineWindowDays} días.`,
    items,
  };
}

/* ------------------------------------------------------------------ */
/* Contexto entre dominios                                             */
/* ------------------------------------------------------------------ */

export interface HealthGymInput {
  state: 'ready' | 'empty' | 'unavailable';
  /** Sesiones registradas; `completed: false` marca una sesión no realizada. */
  sessions: readonly { date: string; completed: boolean | null }[];
}

export interface HealthNutritionInput {
  state: 'ready' | 'partial' | 'unavailable';
  todayEnergyCoverage: NutritionCoverage;
  todayTrackedMeals: number;
  history: readonly { date: string; trackedMealCount: number; energyCoverage: NutritionCoverage }[];
}

export const HEALTH_GYM_UNAVAILABLE: HealthGymInput = { state: 'unavailable', sessions: [] };

export const HEALTH_NUTRITION_UNAVAILABLE: HealthNutritionInput = {
  state: 'unavailable',
  todayEnergyCoverage: 'unknown',
  todayTrackedMeals: 0,
  history: [],
};

/** Proyecta el snapshot read-only de gimnasio al mínimo que necesita Salud. */
export function toHealthGymInput(snapshot: GymSessionsSnapshot | null): HealthGymInput {
  if (!snapshot || snapshot.state === 'error' || snapshot.state === 'unavailable') {
    return HEALTH_GYM_UNAVAILABLE;
  }
  return {
    state: snapshot.state,
    sessions: snapshot.summaries.map((summary) => ({
      date: summary.date,
      completed: summary.completed,
    })),
  };
}

/** Proyecta el dashboard read-only de nutrición al mínimo que necesita Salud. */
export function toHealthNutritionInput(data: NutritionDashboardData | null): HealthNutritionInput {
  if (!data || data.source.status === 'unavailable') return HEALTH_NUTRITION_UNAVAILABLE;
  return {
    state: data.source.status,
    todayEnergyCoverage: data.todayEnergy.coverage,
    todayTrackedMeals: data.todayEnergy.trackedMealCount,
    history: data.history.map((point) => ({
      date: point.date,
      trackedMealCount: point.trackedMealCount,
      energyCoverage: point.energyCoverage,
    })),
  };
}

export interface HealthGymContext {
  state: HealthGymInput['state'];
  headline: string;
  detail: string;
  sessionsLast7: number | null;
  sessionsPrevious7: number | null;
  daysSinceLastSession: number | null;
  lastSessionDate: string | null;
}

export interface HealthNutritionContext {
  state: HealthNutritionInput['state'];
  headline: string;
  detail: string;
  trackedDays: number | null;
  windowDays: number | null;
  todayCoverage: NutritionCoverage | null;
}

export interface HealthCrossDomainContext {
  gym: HealthGymContext;
  nutrition: HealthNutritionContext;
  caveat: string;
}

function daysBetween(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

function buildGymContext(input: HealthGymInput, today: string): HealthGymContext {
  if (input.state === 'unavailable') {
    return {
      state: 'unavailable',
      headline: 'Gimnasio sin conexión',
      detail:
        'El registro de gimnasio no está disponible ahora. Salud sigue funcionando sin ese contexto.',
      sessionsLast7: null,
      sessionsPrevious7: null,
      daysSinceLastSession: null,
      lastSessionDate: null,
    };
  }

  const registered = input.sessions
    .filter((session) => session.completed !== false && session.date <= today)
    .map((session) => session.date)
    .sort();

  if (registered.length === 0) {
    return {
      state: input.state,
      headline: 'Sin sesiones registradas',
      detail: 'El registro de gimnasio está disponible pero no tiene sesiones en este rango.',
      sessionsLast7: 0,
      sessionsPrevious7: 0,
      daysSinceLastSession: null,
      lastSessionDate: null,
    };
  }

  const last7 = registered.filter((date) => daysBetween(date, today) <= 6).length;
  const previous7 = registered.filter((date) => {
    const distance = daysBetween(date, today);
    return distance >= 7 && distance <= 13;
  }).length;
  const lastSessionDate = registered.at(-1) as string;
  const daysSinceLastSession = daysBetween(lastSessionDate, today);
  const density =
    last7 > previous7
      ? 'semana con más frecuencia de fuerza que la anterior'
      : last7 < previous7
        ? 'semana con menos frecuencia de fuerza que la anterior'
        : 'frecuencia de fuerza estable entre semanas';

  return {
    state: 'ready',
    headline: `${last7} sesión(es) en 7 días`,
    detail: `${last7} sesión(es) de fuerza registradas en los últimos 7 días y ${previous7} en los 7 previos: ${density}. Última sesión hace ${daysSinceLastSession} día(s).`,
    sessionsLast7: last7,
    sessionsPrevious7: previous7,
    daysSinceLastSession,
    lastSessionDate,
  };
}

function buildNutritionContext(input: HealthNutritionInput): HealthNutritionContext {
  if (input.state === 'unavailable') {
    return {
      state: 'unavailable',
      headline: 'Nutrición sin conexión',
      detail:
        'Nutrition Intelligence no está disponible ahora. Salud sigue funcionando sin ese contexto.',
      trackedDays: null,
      windowDays: null,
      todayCoverage: null,
    };
  }

  const windowDays = input.history.length;
  const trackedDays = input.history.filter((point) => point.trackedMealCount > 0).length;
  const completeDays = input.history.filter((point) => point.energyCoverage === 'complete').length;

  if (input.state === 'partial' || completeDays < trackedDays) {
    return {
      state: input.state,
      headline: 'Cobertura parcial',
      detail: `La cobertura de nutrición es parcial (${completeDays} de ${trackedDays} día(s) registrados con energía completa), así que no hay evidencia suficiente para relacionar la ingesta con estos cambios de salud.`,
      trackedDays,
      windowDays,
      todayCoverage: input.todayEnergyCoverage,
    };
  }

  return {
    state: 'ready',
    headline: `${trackedDays} de ${windowDays} días registrados`,
    detail: `Registro de nutrición con ${trackedDays} día(s) con comidas sobre ${windowDays} día(s) leídos. Hoy hay ${input.todayTrackedMeals} comida(s) registrada(s).`,
    trackedDays,
    windowDays,
    todayCoverage: input.todayEnergyCoverage,
  };
}

/* ------------------------------------------------------------------ */
/* Qué cambió                                                          */
/* ------------------------------------------------------------------ */

function buildChanges(health: HealthPageData, gym: HealthGymContext): readonly HealthInsight[] {
  const changes: HealthInsight[] = [...health.insights];
  if (
    gym.state === 'ready' &&
    gym.sessionsLast7 !== null &&
    gym.sessionsPrevious7 !== null &&
    gym.sessionsLast7 > 0
  ) {
    changes.push({
      id: 'gym-density-context',
      title: 'Contexto de entrenamiento',
      detail: `El período coincidió con ${gym.sessionsLast7} sesión(es) de fuerza en 7 días frente a ${gym.sessionsPrevious7} en los 7 previos. ${HEALTH_CONTEXT_CAVEAT}`,
      tone: 'neutral',
      kind: 'context',
    });
  }
  return changes.slice(0, HEALTH_MAX_CHANGES);
}

/* ------------------------------------------------------------------ */
/* Calidad de evidencia                                                */
/* ------------------------------------------------------------------ */

export type HealthEvidenceLevel = 'strong' | 'partial' | 'limited';

export interface HealthEvidenceQuality {
  level: HealthEvidenceLevel;
  label: string;
  detail: string;
  todayImport: HealthImportKind | 'missing';
  coreSignalsAvailable: number;
  coreSignalsExpected: number;
  baselineDays: number;
  baselineWindowDays: number;
  periodDaysWithData: number;
  periodDays: number;
  gym: HealthGymContext['state'];
  nutrition: HealthNutritionContext['state'];
}

const EVIDENCE_LABELS: Readonly<Record<HealthEvidenceLevel, string>> = {
  strong: 'Evidencia sólida',
  partial: 'Evidencia parcial',
  limited: 'Interpretación limitada',
};

function buildEvidenceQuality(
  health: HealthPageData,
  state: HealthCurrentState,
  gym: HealthGymContext,
  nutrition: HealthNutritionContext,
): HealthEvidenceQuality {
  const baselineDays = health.signals.baselineCoverageDays;
  const coreAvailable = state.coreAvailable.length;
  const coreExpected = REPORTED_CORE_SIGNALS.length;

  let level: HealthEvidenceLevel;
  if (coreAvailable === 0 || baselineDays < HEALTH_BASELINE_MIN_DAYS) {
    level = 'limited';
  } else if (
    coreAvailable < coreExpected ||
    state.importKind === 'partial' ||
    baselineDays < HEALTH_BASELINE_STRONG_DAYS
  ) {
    level = 'partial';
  } else {
    level = 'strong';
  }

  const missing =
    state.coreMissing.length > 0 ? ` Hoy falta ${joinEs(state.coreMissing.map(lowerEs))}.` : '';

  const detail = health.sourceAvailable
    ? `${coreAvailable} de ${coreExpected} señales núcleo hoy · ${baselineDays} día(s) de base personal sobre ${health.signals.baselineWindowDays} · ${health.availableDays} de ${health.periodDays} días con datos en el período.${missing}`
    : `${HEALTH_SOURCE_UNAVAILABLE_DETAIL} Sin señales, sin base personal y sin cobertura del período para evaluar.`;

  return {
    level,
    label: EVIDENCE_LABELS[level],
    detail,
    todayImport: state.importKind,
    coreSignalsAvailable: coreAvailable,
    coreSignalsExpected: coreExpected,
    baselineDays,
    baselineWindowDays: health.signals.baselineWindowDays,
    periodDaysWithData: health.availableDays,
    periodDays: health.periodDays,
    gym: gym.state,
    nutrition: nutrition.state,
  };
}

/* ------------------------------------------------------------------ */
/* Prioridades                                                         */
/* ------------------------------------------------------------------ */

export type HealthPriorityCategory =
  'sleep' | 'movement' | 'cardio-recovery' | 'data-quality' | 'maintenance';

export interface HealthPriority {
  id: string;
  category: HealthPriorityCategory;
  title: string;
  detail: string;
  /** Dato observado que habilita la prioridad. */
  evidence: string;
  tone: 'neutral' | 'watch';
}

function buildPriorities(input: {
  health: HealthPageData;
  state: HealthCurrentState;
  trajectory: HealthTrajectory;
  quality: HealthEvidenceQuality;
}): readonly HealthPriority[] {
  const { health, state, trajectory, quality } = input;

  if (!health.sourceAvailable) {
    return [
      {
        id: 'source-unavailable',
        category: 'data-quality',
        title: 'Restablecer la lectura de la fuente de salud',
        detail: `${HEALTH_SOURCE_UNAVAILABLE_DETAIL} Hasta que vuelva a leerse, cualquier prioridad fisiológica sería inventada.`,
        evidence: quality.detail,
        tone: 'watch',
      },
    ];
  }

  const priorities: HealthPriority[] = [];
  const bySignal = new Map(state.evidence.map((item) => [item.signal, item]));

  if (quality.level === 'limited') {
    priorities.push({
      id: 'data-quality',
      category: 'data-quality',
      title: 'Primero necesitamos días completos',
      detail:
        'Antes de interpretar recuperación hacen falta días con sueño y frecuencia cardíaca importados. Sin eso, cualquier lectura sería inventada.',
      evidence: quality.detail,
      tone: 'watch',
    });
  }

  const sleepToday = bySignal.get('sleep');
  const sleepTrend = trajectory.items.find((item) => item.id === 'sleep');
  const sleepConcernToday = sleepToday?.concern === true;
  const sleepConcernPeriod = sleepTrend?.material === true && sleepTrend.tone === 'watch';
  if (sleepConcernToday || sleepConcernPeriod) {
    priorities.push({
      id: 'sleep',
      category: 'sleep',
      title: 'Recuperar duración de sueño',
      detail:
        'El sueño es la señal con más peso disponible y la que más se movió respecto de tu propio patrón.',
      evidence:
        sleepConcernToday && sleepToday ? sleepToday.text : (sleepTrend?.summary ?? quality.detail),
      tone: 'watch',
    });
  }

  const restingToday = bySignal.get('restingHr');
  const hrvToday = bySignal.get('hrv');
  const alignedRecovery =
    restingToday?.concern === true && (sleepConcernToday || hrvToday?.concern === true);
  if (alignedRecovery && quality.level !== 'limited') {
    priorities.push({
      id: 'cardio-recovery',
      category: 'cardio-recovery',
      title: 'Aflojar la carga hasta que la FC en reposo vuelva a tu rango',
      detail:
        'Hay más de una señal de recuperación desviada al mismo tiempo respecto de tu base personal. Es monitoreo personal, no una indicación médica.',
      evidence: [restingToday?.text, sleepConcernToday ? sleepToday?.text : hrvToday?.text]
        .filter((text): text is string => Boolean(text))
        .join(' '),
      tone: 'watch',
    });
  }

  const stepsTrend = trajectory.items.find((item) => item.id === 'steps');
  if (stepsTrend?.material === true && stepsTrend.tone === 'watch') {
    priorities.push({
      id: 'movement',
      category: 'movement',
      title: 'Tu principal cambio del período es menos movimiento diario',
      detail: 'El volumen de pasos bajó frente al período anterior con cobertura comparable.',
      evidence: stepsTrend.summary,
      tone: 'neutral',
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      id: 'maintenance',
      category: 'maintenance',
      title: 'Mantené el patrón actual',
      detail: 'No aparece un cambio material que requiera corrección con la evidencia disponible.',
      evidence: `${health.availableDays} de ${health.periodDays} días con datos. ${trajectory.headline}`,
      tone: 'neutral',
    });
  }

  return priorities.slice(0, HEALTH_MAX_PRIORITIES);
}

/* ------------------------------------------------------------------ */
/* Composición                                                         */
/* ------------------------------------------------------------------ */

export interface HealthIntelligenceInput {
  health: HealthPageData;
  gym: HealthGymInput;
  nutrition: HealthNutritionInput;
}

export interface HealthIntelligence {
  currentState: HealthCurrentState;
  trajectory: HealthTrajectory;
  changes: readonly HealthInsight[];
  crossDomain: HealthCrossDomainContext;
  priorities: readonly HealthPriority[];
  evidenceQuality: HealthEvidenceQuality;
}

/** Construye la lectura completa de Health Intelligence a partir de datos ya saneados. */
export function buildHealthIntelligence(input: HealthIntelligenceInput): HealthIntelligence {
  const { health } = input;
  const today = health.signals.today;

  const evidence = [...HEALTH_CORE_SIGNALS, ...HEALTH_CONTEXT_SIGNALS].map((signal) =>
    buildSignalEvidence(signal, today, health.signals.baseline[signal]),
  );

  const currentState = buildCurrentState(health, evidence);
  const trajectory = buildTrajectory(health);
  const gym = buildGymContext(input.gym, health.targetDate);
  const nutrition = buildNutritionContext(input.nutrition);
  const evidenceQuality = buildEvidenceQuality(health, currentState, gym, nutrition);

  return {
    currentState,
    trajectory,
    changes: buildChanges(health, gym),
    crossDomain: { gym, nutrition, caveat: HEALTH_CONTEXT_CAVEAT },
    priorities: buildPriorities({
      health,
      state: currentState,
      trajectory,
      quality: evidenceQuality,
    }),
    evidenceQuality,
  };
}
