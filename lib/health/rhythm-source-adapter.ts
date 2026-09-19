import type {
  RhythmActivityObservation,
  RhythmSleepObservation,
  RhythmStabilityInput,
} from './rhythm';

export type RhythmMetricAvailability = 'available' | 'missing' | 'invalid';

export type RhythmAdapterDiagnosticCode =
  | 'invalid-filename'
  | 'file-date-conflict'
  | 'payload-date-mismatch'
  | 'invalid-payload'
  | 'invalid-units'
  | 'invalid-timestamp'
  | 'ambiguous-sleep-records'
  | 'ambiguous-activity-hour'
  | 'older-source-skipped'
  | 'previous-evidence-preserved';

export interface RhythmAdapterDiagnostic {
  code: RhythmAdapterDiagnosticCode;
  channel: 'sleep' | 'rhythm' | 'combined';
  detail: string;
}

export interface HaeRhythmRawFile {
  fileName: string;
  modifiedAt?: string | null;
  payload: unknown;
}

export interface RhythmSourceVersion {
  fileName: string;
  modifiedAt: string | null;
}

export interface RhythmSourceRegime {
  sleepSources: readonly string[];
  activitySources: readonly string[];
  heartRateSources: readonly string[];
  restingHeartRateSources: readonly string[];
  hrvSources: readonly string[];
}

export interface RhythmSourceAvailability {
  sleepTiming: RhythmMetricAvailability;
  activity: RhythmMetricAvailability;
  heartRate: RhythmMetricAvailability;
  restingHeartRate: RhythmMetricAvailability;
  hrv: RhythmMetricAvailability;
}

export interface NormalizedRhythmDay {
  /** Local calendar day represented by the source files. Null means fail-closed identity. */
  date: string | null;
  sleep: RhythmSleepObservation | null;
  activity: RhythmActivityObservation | null;
  availability: RhythmSourceAvailability;
  sourceRegime: RhythmSourceRegime;
  sourceVersions: {
    sleep: RhythmSourceVersion | null;
    rhythm: RhythmSourceVersion | null;
  };
  preservedFromPrevious: {
    sleep: boolean;
    activity: boolean;
  };
  diagnostics: readonly RhythmAdapterDiagnostic[];
}

export interface RhythmSourceAdapterInput {
  sleepFile?: HaeRhythmRawFile | null;
  rhythmFile?: HaeRhythmRawFile | null;
  /** Optional previously accepted day, used only for monotonic reconciliation. */
  previous?: NormalizedRhythmDay | null;
}

type RecordLike = Record<string, unknown>;

interface MetricLike {
  name: string;
  units: string | null;
  data: readonly RecordLike[];
}

interface ParsedChannel<T> {
  value: T | null;
  availability: RhythmMetricAvailability;
  sources: readonly string[];
  diagnostics: RhythmAdapterDiagnostic[];
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?\s*(Z|[+-]\d{2}:?\d{2})$/;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDay(value: string): boolean {
  const match = DAY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function localDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (isValidDay(trimmed)) return trimmed;
  const match = OFFSET_TIMESTAMP_RE.exec(trimmed);
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  return isValidDay(day) ? day : null;
}

function localHour(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = OFFSET_TIMESTAMP_RE.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[4]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function hasExplicitOffset(value: unknown): value is string {
  return typeof value === 'string' && OFFSET_TIMESTAMP_RE.test(value.trim());
}

function parseFileDay(fileName: string, prefix: 'HealthSleep' | 'HealthRhythm'): string | null {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedPrefix}-(\\d{4}-\\d{2}-\\d{2})\\.json$`).exec(fileName);
  return match && isValidDay(match[1]) ? match[1] : null;
}

function parseModifiedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceVersion(file: HaeRhythmRawFile | null | undefined): RhythmSourceVersion | null {
  if (!file) return null;
  return { fileName: file.fileName, modifiedAt: file.modifiedAt ?? null };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function sourceOf(record: RecordLike): string | null {
  return typeof record.source === 'string' && record.source.trim().length > 0
    ? record.source.trim()
    : null;
}

function metricsFromPayload(
  payload: unknown,
  channel: 'sleep' | 'rhythm',
): { metrics: MetricLike[]; diagnostics: RhythmAdapterDiagnostic[] } {
  const diagnostics: RhythmAdapterDiagnostic[] = [];
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.metrics)) {
    diagnostics.push({
      code: 'invalid-payload',
      channel,
      detail: 'El payload no contiene data.metrics como arreglo.',
    });
    return { metrics: [], diagnostics };
  }

  const metrics: MetricLike[] = [];
  for (const rawMetric of payload.data.metrics) {
    if (
      !isRecord(rawMetric) ||
      typeof rawMetric.name !== 'string' ||
      !Array.isArray(rawMetric.data)
    ) {
      continue;
    }
    metrics.push({
      name: rawMetric.name,
      units: typeof rawMetric.units === 'string' ? rawMetric.units : null,
      data: rawMetric.data.filter(isRecord),
    });
  }
  return { metrics, diagnostics };
}

function metricByName(metrics: readonly MetricLike[], name: string): MetricLike | null {
  return metrics.find((metric) => metric.name === name) ?? null;
}

function validateMetricDates(
  metrics: readonly MetricLike[],
  names: readonly string[],
  expectedDay: string,
  channel: 'sleep' | 'rhythm',
): RhythmAdapterDiagnostic[] {
  const diagnostics: RhythmAdapterDiagnostic[] = [];
  for (const metric of metrics) {
    if (!names.includes(metric.name)) continue;
    for (const record of metric.data) {
      if (record.date === undefined) continue;
      const day = localDay(record.date);
      if (day !== expectedDay) {
        diagnostics.push({
          code: 'payload-date-mismatch',
          channel,
          detail: `${metric.name} contiene una fecha que no coincide con ${expectedDay}.`,
        });
        return diagnostics;
      }
    }
  }
  return diagnostics;
}

function parseSleep(
  metrics: readonly MetricLike[],
  expectedDay: string,
): ParsedChannel<RhythmSleepObservation> {
  const diagnostics: RhythmAdapterDiagnostic[] = [];
  const metric = metricByName(metrics, 'sleep_analysis');
  if (!metric) return { value: null, availability: 'missing', sources: [], diagnostics };
  if (metric.units !== 'hr') {
    diagnostics.push({
      code: 'invalid-units',
      channel: 'sleep',
      detail: 'sleep_analysis debe usar unidades hr.',
    });
    return { value: null, availability: 'invalid', sources: [], diagnostics };
  }

  const dateProblems = validateMetricDates(metrics, ['sleep_analysis'], expectedDay, 'sleep');
  if (dateProblems.length > 0) {
    return { value: null, availability: 'invalid', sources: [], diagnostics: dateProblems };
  }

  const candidates = metric.data.filter((record) => localDay(record.date) === expectedDay);
  if (candidates.length === 0) {
    return { value: null, availability: 'missing', sources: [], diagnostics };
  }

  const normalized = candidates
    .map((record) => ({
      sleepStart: hasExplicitOffset(record.sleepStart) ? record.sleepStart.trim() : null,
      sleepEnd: hasExplicitOffset(record.sleepEnd) ? record.sleepEnd.trim() : null,
      source: sourceOf(record),
    }))
    .filter((item) => item.sleepStart !== null && item.sleepEnd !== null);

  if (normalized.length === 0) {
    diagnostics.push({
      code: 'invalid-timestamp',
      channel: 'sleep',
      detail: 'sleepStart/sleepEnd requieren offset UTC explícito.',
    });
    return {
      value: null,
      availability: 'invalid',
      sources: uniqueStrings(
        candidates.map(sourceOf).filter((value): value is string => value !== null),
      ),
      diagnostics,
    };
  }

  const signatures = uniqueStrings(
    normalized.map((item) => `${item.sleepStart}|${item.sleepEnd}|${item.source ?? ''}`),
  );
  if (signatures.length > 1) {
    diagnostics.push({
      code: 'ambiguous-sleep-records',
      channel: 'sleep',
      detail: 'Hay más de un registro de sueño diario no equivalente; se falla cerrado.',
    });
    return {
      value: null,
      availability: 'invalid',
      sources: uniqueStrings(normalized.map((item) => item.source ?? '')),
      diagnostics,
    };
  }

  const selected = normalized[0];
  return {
    value: { date: expectedDay, sleepStart: selected.sleepStart, sleepEnd: selected.sleepEnd },
    availability: 'available',
    sources: uniqueStrings(normalized.map((item) => item.source ?? '')),
    diagnostics,
  };
}

function parseActivity(
  metrics: readonly MetricLike[],
  expectedDay: string,
): ParsedChannel<RhythmActivityObservation> {
  const diagnostics: RhythmAdapterDiagnostic[] = [];
  const metric = metricByName(metrics, 'step_count');
  if (!metric) return { value: null, availability: 'missing', sources: [], diagnostics };
  if (metric.units !== 'count') {
    diagnostics.push({
      code: 'invalid-units',
      channel: 'rhythm',
      detail: 'step_count debe usar unidades count.',
    });
    return { value: null, availability: 'invalid', sources: [], diagnostics };
  }

  const byHour = new Map<number, Array<{ steps: number; source: string | null }>>();
  let sawInvalidTimestamp = false;
  for (const record of metric.data) {
    const day = localDay(record.date);
    if (day !== expectedDay) {
      diagnostics.push({
        code: 'payload-date-mismatch',
        channel: 'rhythm',
        detail: `step_count contiene una fecha que no coincide con ${expectedDay}.`,
      });
      return { value: null, availability: 'invalid', sources: [], diagnostics };
    }
    const hour = localHour(record.date);
    if (hour === null) {
      sawInvalidTimestamp = true;
      continue;
    }
    if (typeof record.qty !== 'number' || !Number.isFinite(record.qty) || record.qty < 0) continue;
    const bucket = byHour.get(hour) ?? [];
    bucket.push({ steps: record.qty, source: sourceOf(record) });
    byHour.set(hour, bucket);
  }

  if (sawInvalidTimestamp) {
    diagnostics.push({
      code: 'invalid-timestamp',
      channel: 'rhythm',
      detail: 'Los bins horarios requieren timestamp con offset explícito.',
    });
  }

  const hours: Array<{ hour: number; steps: number }> = [];
  const sources: string[] = [];
  for (const [hour, bucket] of [...byHour.entries()].sort((a, b) => a[0] - b[0])) {
    const signatures = uniqueStrings(bucket.map((item) => `${item.steps}|${item.source ?? ''}`));
    if (signatures.length > 1) {
      diagnostics.push({
        code: 'ambiguous-activity-hour',
        channel: 'rhythm',
        detail: `La hora ${hour} tiene muestras no equivalentes; se omite ese bin sin sumar.`,
      });
      continue;
    }
    const selected = bucket[0];
    hours.push({ hour, steps: selected.steps });
    if (selected.source) sources.push(selected.source);
  }

  if (hours.length === 0) {
    return {
      value: null,
      availability: metric.data.length === 0 ? 'missing' : 'invalid',
      sources: uniqueStrings(sources),
      diagnostics,
    };
  }

  return {
    value: { date: expectedDay, hours },
    availability: 'available',
    sources: uniqueStrings(sources),
    diagnostics,
  };
}

function metricAvailability(
  metrics: readonly MetricLike[],
  name: string,
  expectedDay: string,
): { availability: RhythmMetricAvailability; sources: string[] } {
  const metric = metricByName(metrics, name);
  if (!metric) return { availability: 'missing', sources: [] };
  const matching = metric.data.filter((record) => localDay(record.date) === expectedDay);
  if (matching.length === 0) {
    return { availability: metric.data.length === 0 ? 'missing' : 'invalid', sources: [] };
  }
  return {
    availability: 'available',
    sources: uniqueStrings(
      matching.map(sourceOf).filter((value): value is string => value !== null),
    ),
  };
}

function emptyAvailability(): RhythmSourceAvailability {
  return {
    sleepTiming: 'missing',
    activity: 'missing',
    heartRate: 'missing',
    restingHeartRate: 'missing',
    hrv: 'missing',
  };
}

function emptySourceRegime(): RhythmSourceRegime {
  return {
    sleepSources: [],
    activitySources: [],
    heartRateSources: [],
    restingHeartRateSources: [],
    hrvSources: [],
  };
}

function isOlder(
  incoming: RhythmSourceVersion | null,
  previous: RhythmSourceVersion | null,
): boolean {
  const incomingMs = parseModifiedAt(incoming?.modifiedAt);
  const previousMs = parseModifiedAt(previous?.modifiedAt);
  return incomingMs !== null && previousMs !== null && incomingMs < previousMs;
}

function preservePreviousSleep(
  current: NormalizedRhythmDay,
  previous: NormalizedRhythmDay,
  reason: 'older' | 'missing',
): void {
  if (!previous.sleep) return;
  current.sleep = previous.sleep;
  current.sourceRegime = {
    ...current.sourceRegime,
    sleepSources: previous.sourceRegime.sleepSources,
  };
  current.preservedFromPrevious.sleep = true;
  current.diagnostics = [
    ...current.diagnostics,
    {
      code: reason === 'older' ? 'older-source-skipped' : 'previous-evidence-preserved',
      channel: 'sleep',
      detail:
        reason === 'older'
          ? 'Se preservó el sueño aceptado porque la revisión entrante es más antigua.'
          : 'La captura nueva no aportó timing de sueño válido; se preservó la evidencia ' +
            'previa.',
    },
  ];
}

function preservePreviousActivity(
  current: NormalizedRhythmDay,
  previous: NormalizedRhythmDay,
  reason: 'older' | 'missing',
): void {
  if (!previous.activity) return;
  current.activity = previous.activity;
  current.sourceRegime = {
    ...current.sourceRegime,
    activitySources: previous.sourceRegime.activitySources,
  };
  current.preservedFromPrevious.activity = true;
  current.diagnostics = [
    ...current.diagnostics,
    {
      code: reason === 'older' ? 'older-source-skipped' : 'previous-evidence-preserved',
      channel: 'rhythm',
      detail:
        reason === 'older'
          ? 'Se preservó la actividad aceptada porque la revisión entrante es más antigua.'
          : 'La captura nueva no aportó actividad horaria válida; se preservó la evidencia ' +
            'previa.',
    },
  ];
}

export function adaptHaeRhythmSources(input: RhythmSourceAdapterInput): NormalizedRhythmDay {
  const diagnostics: RhythmAdapterDiagnostic[] = [];
  const sleepDay = input.sleepFile ? parseFileDay(input.sleepFile.fileName, 'HealthSleep') : null;
  const rhythmDay = input.rhythmFile
    ? parseFileDay(input.rhythmFile.fileName, 'HealthRhythm')
    : null;

  if (input.sleepFile && sleepDay === null) {
    diagnostics.push({
      code: 'invalid-filename',
      channel: 'sleep',
      detail: 'Filename de sueño inválido.',
    });
  }
  if (input.rhythmFile && rhythmDay === null) {
    diagnostics.push({
      code: 'invalid-filename',
      channel: 'rhythm',
      detail: 'Filename de ritmo inválido.',
    });
  }

  if (sleepDay && rhythmDay && sleepDay !== rhythmDay) {
    diagnostics.push({
      code: 'file-date-conflict',
      channel: 'combined',
      detail: 'Los archivos de sueño y ritmo representan días distintos.',
    });
  }

  const date =
    sleepDay && rhythmDay && sleepDay !== rhythmDay ? null : (sleepDay ?? rhythmDay ?? null);
  const availability = emptyAvailability();
  let sourceRegime = emptySourceRegime();
  let sleep: RhythmSleepObservation | null = null;
  let activity: RhythmActivityObservation | null = null;

  if (date && input.sleepFile && sleepDay === date) {
    const parsed = metricsFromPayload(input.sleepFile.payload, 'sleep');
    diagnostics.push(...parsed.diagnostics);
    if (parsed.diagnostics.length === 0) {
      const sleepResult = parseSleep(parsed.metrics, date);
      sleep = sleepResult.value;
      availability.sleepTiming = sleepResult.availability;
      sourceRegime = { ...sourceRegime, sleepSources: sleepResult.sources };
      diagnostics.push(...sleepResult.diagnostics);
    } else {
      availability.sleepTiming = 'invalid';
    }
  }

  if (date && input.rhythmFile && rhythmDay === date) {
    const parsed = metricsFromPayload(input.rhythmFile.payload, 'rhythm');
    diagnostics.push(...parsed.diagnostics);
    if (parsed.diagnostics.length === 0) {
      const relevantDates = validateMetricDates(
        parsed.metrics,
        ['heart_rate', 'resting_heart_rate', 'heart_rate_variability'],
        date,
        'rhythm',
      );
      diagnostics.push(...relevantDates);
      const activityResult = parseActivity(parsed.metrics, date);
      activity = activityResult.value;
      availability.activity = activityResult.availability;
      diagnostics.push(...activityResult.diagnostics);

      const heartRate = metricAvailability(parsed.metrics, 'heart_rate', date);
      const restingHeartRate = metricAvailability(parsed.metrics, 'resting_heart_rate', date);
      const hrv = metricAvailability(parsed.metrics, 'heart_rate_variability', date);
      availability.heartRate = relevantDates.length > 0 ? 'invalid' : heartRate.availability;
      availability.restingHeartRate =
        relevantDates.length > 0 ? 'invalid' : restingHeartRate.availability;
      availability.hrv = relevantDates.length > 0 ? 'invalid' : hrv.availability;
      sourceRegime = {
        ...sourceRegime,
        activitySources: activityResult.sources,
        heartRateSources: heartRate.sources,
        restingHeartRateSources: restingHeartRate.sources,
        hrvSources: hrv.sources,
      };
    } else {
      availability.activity = 'invalid';
      availability.heartRate = 'invalid';
      availability.restingHeartRate = 'invalid';
      availability.hrv = 'invalid';
    }
  }

  const current: NormalizedRhythmDay = {
    date,
    sleep,
    activity,
    availability,
    sourceRegime,
    sourceVersions: {
      sleep: sourceVersion(input.sleepFile),
      rhythm: sourceVersion(input.rhythmFile),
    },
    preservedFromPrevious: { sleep: false, activity: false },
    diagnostics,
  };

  const previous = input.previous;
  if (!previous || !date || previous.date !== date) return current;

  if (!input.sleepFile) {
    current.sleep = previous.sleep;
    current.availability.sleepTiming = previous.availability.sleepTiming;
    current.sourceRegime = {
      ...current.sourceRegime,
      sleepSources: previous.sourceRegime.sleepSources,
    };
    current.sourceVersions.sleep = previous.sourceVersions.sleep;
  } else if (isOlder(current.sourceVersions.sleep, previous.sourceVersions.sleep)) {
    preservePreviousSleep(current, previous, 'older');
    current.sourceVersions.sleep = previous.sourceVersions.sleep;
  } else if (!current.sleep && previous.sleep) {
    preservePreviousSleep(current, previous, 'missing');
  }

  if (!input.rhythmFile) {
    current.activity = previous.activity;
    current.availability.activity = previous.availability.activity;
    current.availability.heartRate = previous.availability.heartRate;
    current.availability.restingHeartRate = previous.availability.restingHeartRate;
    current.availability.hrv = previous.availability.hrv;
    current.sourceRegime = {
      ...current.sourceRegime,
      activitySources: previous.sourceRegime.activitySources,
      heartRateSources: previous.sourceRegime.heartRateSources,
      restingHeartRateSources: previous.sourceRegime.restingHeartRateSources,
      hrvSources: previous.sourceRegime.hrvSources,
    };
    current.sourceVersions.rhythm = previous.sourceVersions.rhythm;
  } else if (isOlder(current.sourceVersions.rhythm, previous.sourceVersions.rhythm)) {
    preservePreviousActivity(current, previous, 'older');
    current.availability.heartRate = previous.availability.heartRate;
    current.availability.restingHeartRate = previous.availability.restingHeartRate;
    current.availability.hrv = previous.availability.hrv;
    current.sourceRegime = {
      ...current.sourceRegime,
      heartRateSources: previous.sourceRegime.heartRateSources,
      restingHeartRateSources: previous.sourceRegime.restingHeartRateSources,
      hrvSources: previous.sourceRegime.hrvSources,
    };
    current.sourceVersions.rhythm = previous.sourceVersions.rhythm;
  } else if (!current.activity && previous.activity) {
    preservePreviousActivity(current, previous, 'missing');
  }

  return current;
}

export function toRhythmStabilityInput(
  days: readonly NormalizedRhythmDay[],
): RhythmStabilityInput {
  const byDate = new Map<string, NormalizedRhythmDay>();
  for (const day of days) {
    if (!day.date) continue;
    byDate.set(day.date, day);
  }
  const ordered = [...byDate.values()].sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
  return {
    sleep: ordered
      .map((day) => day.sleep)
      .filter((value): value is RhythmSleepObservation => value !== null),
    activity: ordered
      .map((day) => day.activity)
      .filter((value): value is RhythmActivityObservation => value !== null),
  };
}
