export type RhythmStabilityBand =
  | 'very-stable'
  | 'stable'
  | 'variable'
  | 'irregular'
  | 'insufficient';

export type RhythmStabilityConfidenceBand = 'high' | 'medium' | 'low';

export interface RhythmSleepObservation {
  /** Local calendar day assigned by the source contract. */
  date: string;
  /** Timestamp with an explicit UTC offset, e.g. 2026-09-19T00:59:00-03:00. */
  sleepStart: string | null;
  /** Timestamp with an explicit UTC offset. */
  sleepEnd: string | null;
}

export interface RhythmActivityHour {
  /** Local hour 0..23. Input must already be source-normalized/deduplicated. */
  hour: number;
  steps: number | null;
}

export interface RhythmActivityObservation {
  date: string;
  hours: readonly RhythmActivityHour[];
}

export interface RhythmStabilityInput {
  sleep: readonly RhythmSleepObservation[];
  activity?: readonly RhythmActivityObservation[];
}

export interface RhythmStabilityContributor {
  id: 'sleep-midpoint' | 'wake-time' | 'sleep-duration' | 'activity-midpoint';
  label: string;
  /** null = evidence unavailable; never convert missing to zero. */
  score: number | null;
  weight: number;
  medianDayToDayShiftMinutes: number | null;
  observedPairs: number;
  detail: string;
}

export interface RhythmStabilityResult {
  label: 'Rhythm Stability';
  question: string;
  score: number | null;
  band: RhythmStabilityBand;
  confidence: number;
  confidenceBand: RhythmStabilityConfidenceBand;
  evidenceStrength: 'moderate';
  evidenceSummary: string;
  personalPosition: string;
  validSleepNights: number;
  validActivityDays: number;
  contributors: readonly RhythmStabilityContributor[];
  uncertainties: readonly string[];
  calculationVersion: 'rhythm-stability-v1.0.0';
}

interface ParsedTimestamp {
  epochMs: number;
  localMinute: number;
}

interface SleepFeatureDay {
  date: string;
  midpointMinute: number;
  wakeMinute: number;
  durationMinutes: number;
}

interface DatedValue {
  date: string;
  value: number;
}

const CALCULATION_VERSION = 'rhythm-stability-v1.0.0' as const;
const MIN_SLEEP_PAIRS = 4;
const MIN_ACTIVITY_PAIRS = 3;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function linear(points: readonly (readonly [number, number])[], value: number): number {
  if (value <= points[0][0]) return points[0][1];
  const last = points.at(-1) as readonly [number, number];
  if (value >= last[0]) return last[1];

  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    if (value <= x2) {
      const ratio = (value - x1) / (x2 - x1);
      return y1 + ratio * (y2 - y1);
    }
  }

  return last[1];
}

/** Product consistency scale, deliberately not a clinical risk threshold. */
function stabilityUtility(shiftMinutes: number): number {
  return Math.round(
    linear(
      [
        [0, 100],
        [15, 98],
        [30, 92],
        [45, 84],
        [60, 74],
        [90, 55],
        [120, 38],
        [180, 18],
        [240, 5],
      ],
      Math.max(0, shiftMinutes),
    ),
  );
}

function parseYmd(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value.getTime();
}

function areConsecutiveDays(previous: string, current: string): boolean {
  const previousMs = parseYmd(previous);
  const currentMs = parseYmd(current);
  return previousMs !== null && currentMs !== null && currentMs - previousMs === 86_400_000;
}

function parseTimestamp(value: string): ParsedTimestamp | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(Z|[+-]\d{2}:?\d{2})$/.exec(
      value.trim(),
    );
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '00', millis = '0', zone] = match;
  const normalizedZone =
    zone === 'Z' ? 'Z' : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const normalizedMillis = millis.padEnd(3, '0');
  const canonical = `${year}-${month}-${day}T${hour}:${minute}:${second}.${normalizedMillis}${normalizedZone}`;
  const epochMs = Date.parse(canonical);
  if (!Number.isFinite(epochMs)) return null;

  const localMinute = Number(hour) * 60 + Number(minute) + Number(second) / 60;
  if (localMinute < 0 || localMinute >= 1440) return null;

  return { epochMs, localMinute };
}

function normalizeMinute(value: number): number {
  return ((value % 1440) + 1440) % 1440;
}

function circularMinuteDifference(a: number, b: number): number {
  const absolute = Math.abs(a - b);
  return Math.min(absolute, 1440 - absolute);
}

function sleepFeature(observation: RhythmSleepObservation): SleepFeatureDay | null {
  if (parseYmd(observation.date) === null || !observation.sleepStart || !observation.sleepEnd) {
    return null;
  }
  const start = parseTimestamp(observation.sleepStart);
  const end = parseTimestamp(observation.sleepEnd);
  if (!start || !end) return null;

  const durationMinutes = (end.epochMs - start.epochMs) / 60_000;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) return null;

  return {
    date: observation.date,
    midpointMinute: normalizeMinute(start.localMinute + durationMinutes / 2),
    wakeMinute: end.localMinute,
    durationMinutes,
  };
}

function uniqueByDate<T extends { date: string }>(values: readonly T[]): T[] {
  const map = new Map<string, T>();
  for (const value of values) map.set(value.date, value);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function pairShifts(values: readonly DatedValue[], circular: boolean): number[] {
  const shifts: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (!areConsecutiveDays(previous.date, current.date)) continue;
    shifts.push(
      circular
        ? circularMinuteDifference(previous.value, current.value)
        : Math.abs(previous.value - current.value),
    );
  }
  return shifts;
}

function activityMidpoint(observation: RhythmActivityObservation): number | null {
  const valid = observation.hours
    .filter(
      (item) =>
        Number.isInteger(item.hour) &&
        item.hour >= 0 &&
        item.hour <= 23 &&
        item.steps !== null &&
        Number.isFinite(item.steps) &&
        (item.steps as number) >= 0,
    )
    .map((item) => ({ hour: item.hour, steps: item.steps as number }))
    .sort((a, b) => a.hour - b.hour);

  const active = valid.filter((item) => item.steps > 0);
  if (active.length < 3) return null;
  const total = active.reduce((sum, item) => sum + item.steps, 0);
  if (total <= 0) return null;

  let cumulative = 0;
  for (const item of active) {
    cumulative += item.steps;
    if (cumulative >= total / 2) return item.hour * 60 + 30;
  }
  return null;
}

function contributor(
  id: RhythmStabilityContributor['id'],
  label: string,
  weight: number,
  shifts: readonly number[],
  minimumPairs: number;
): RhythmStabilityContributor {
  const shift = median(shifts);
  const available = shift !== null && shifts.length >= minimumPairs;
  return {
    id,
    label,
    score: available ? stabilityUtility(shift) : null,
    weight,
    medianDayToDayShiftMinutes: shift === null ? null : round(shift, 1),
    observedPairs: shifts.length,
    detail:
      shift === null
        ? 'Sin pares de días consecutivos utilizables.'
        : available
          ? `Cambio día-a-día mediano: ${round(shift)} min (${shifts.length} pares).`
          : `Sólo ${shifts.length} pares consecutivos; hacen falta ${minimumPairs}.`,
  };
}

function confidenceBand(confidence: number): RhythmStabilityConfidenceBand {
  if (confidence >= 80) return 'high';
  if (confidence >= 55) return 'medium';
  return 'low';
}

function band(score: number | null): RhythmStabilityBand {
  if (score === null) return 'insufficient';
  if (score >= 85) return 'very-stable';
  if (score >= 70) return 'stable';
  if (score >= 50) return 'variable';
  return 'irregular';
}

export function buildRhythmStability(input: RhythmStabilityInput): RhythmStabilityResult {
  const sleepDays = uniqueByDate(
    input.sleep.map(sleepFeature).filter((value): value is SleepFeatureDay => value !== null),
  );

  const midpointShifts = pairShifts(
    sleepDays.map((item) => ({ date: item.date, value: item.midpointMinute })),
    true,
  );
  const wakeShifts = pairShifts(
    sleepDays.map((item) => ({ date: item.date, value: item.wakeMinute })),
    true,
  );
  const durationShifts = pairShifts(
    sleepDays.map((item) => ({ date: item.date, value: item.durationMinutes })),
    false,
  );

  const activityDays = uniqueByDate(
    (input.activity ?? [])
      .map((item) => ({ date: item.date, value: activityMidpoint(item) }))
      .filter(
        (item): item is { date: string; value: number } =>
          parseYmd(item.date) !== null && item.value !== null,
      ),
  );
  const activityShifts = pairShifts(activityDays, true);

  const contributors = [
    contributor('sleep-midpoint', 'Midpoint del sueño', 0.45, midpointShifts, MIN_SLEEP_PAIRS),
    contributor('wake-time', 'Hora de despertar', 0.25, wakeShifts, MIN_SLEEP_PAIRS),
    contributor('sleep-duration', 'Duración del sueño', 0.2, durationShifts, MIN_SLEEP_PAIRS),
    contributor('activity-midpoint', 'Midpoint de actividad', 0.1, activityShifts, MIN_ACTIVITY_PAIRS),
  ] as const;

  const requiredSleepAvailable = contributors.slice(0, 3).every((item) => item.score !== null);
  const available = contributors.filter((item) => item.score !== null);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const score =
    requiredSleepAvailable && availableWeight > 0
      ? Math.round(
          available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) /
            availableWeight,
        )
      : null;

  const sleepCoverage = clamp(sleepDays.length / 7);
  const historyDepth = clamp(sleepDays.length / 14);
  const activityCoverage = clamp(activityDays.length / 7);
  let confidence = Math.round(
    100 * (0.55 * sleepCoverage + 0.35 * historyDepth + 0.1 * activityCoverage),
  );
  if (score === null) confidence = Math.min(confidence, 49);

  const midpointShift = contributors[0].medianDayToDayShiftMinutes;
  const personalPosition =
    score === null
      ? `Evidencia insuficiente: ${sleepDays.length} noches válidas.`
      : midpointShift === null
        ? 'Evidencia insuficiente para resumir el ritmo.'
        : `El midpoint del sueño cambió una mediana de ${round(midpointShift)} min entre noches consecutivas.`;

  return {
    label: 'Rhythm Stability',
    question: '¿Qué tan consistente fue tu horario de sueño y actividad en los últimos días?',
    score,
    band: band(score),
    confidence,
    confidenceBand: confidenceBand(confidence),
    evidenceStrength: 'moderate',
    evidenceSummary:
      'La regularidad y el timing son dimensiones reconocidas de salud del sueño; la evidencia de ritmos de actividad es longitudinal y emergente. Este índice mide consistencia personal, no riesgo clínico.',
    personalPosition,
    validSleepNights: sleepDays.length,
    validActivityDays: activityDays.length,
    contributors,
    uncertainties: [
      'Los timestamps provienen de un wearable/HealthKit de consumo y pueden tener latencia o errores de medición.',
      'La escala minuto→score es una regla de producto versionada, no un punto de corte clínico.',
      ...(contributors[3].score === null
        ? ['El midpoint de actividad no pesa hasta tener suficientes días horarios utilizables.']
        : []),
      'No se interpreta irregularidad como enfermedad, estrés, sobreentrenamiento ni riesgo cardiovascular.',
    ],
    calculationVersion: CALCULATION_VERSION,
  };
}
