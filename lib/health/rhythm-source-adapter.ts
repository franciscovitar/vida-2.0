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
      sources: uniqueStrings(candidates.map(sourceOf).filter((value): value is string => value !== null)),
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
