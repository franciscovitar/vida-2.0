/**
 * Read-only boundary for normalized Rhythm features stored in Google Sheets.
 *
 * Heavy/original HAE JSON remains in Drive. Health Sync is responsible for
 * source reconciliation and for writing only normalized features into the
 * canonical sheet. Vida Web reads the derived tab through the existing Sheets
 * transport and never needs Drive credentials or folder permissions.
 */
import { readTabValues } from '@/lib/google/sheets-read';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';
import {
  buildRhythmStability,
  type RhythmActivityObservation,
  type RhythmSleepObservation,
  type RhythmStabilityInput,
  type RhythmStabilityResult,
} from '@/lib/health/rhythm';

export const HEALTH_RHYTHM_FEATURES_TAB = 'Health Rhythm Features';

export const HEALTH_RHYTHM_FEATURES_HEADERS = [
  'Date',
  'Sleep Start',
  'Sleep End',
  'Hourly Steps JSON',
  'Sleep Availability',
  'Activity Availability',
  'Sleep Source Modified At',
  'Rhythm Source Modified At',
  'Feature Version',
] as const;

export const HEALTH_RHYTHM_FEATURE_VERSION = 'rhythm-features-v1';

export type RhythmFeatureAvailability = 'available' | 'missing' | 'invalid' | 'preserved';

export interface RhythmFeatureDay {
  date: string;
  sleep: RhythmSleepObservation | null;
  activity: RhythmActivityObservation | null;
  sleepAvailability: RhythmFeatureAvailability;
  activityAvailability: RhythmFeatureAvailability;
  sleepSourceModifiedAt: string | null;
  rhythmSourceModifiedAt: string | null;
  featureVersion: typeof HEALTH_RHYTHM_FEATURE_VERSION;
}

export interface RhythmFeaturesSnapshot {
  state: 'ready' | 'empty' | 'unavailable' | 'error';
  notice: string | null;
  days: readonly RhythmFeatureDay[];
  input: RhythmStabilityInput;
}

export type RhythmFeaturesViewState =
  | 'ready'
  | 'insufficient'
  | 'empty'
  | 'unavailable'
  | 'error';

export interface RhythmFeaturesViewModel {
  state: RhythmFeaturesViewState;
  notice: string | null;
  result: RhythmStabilityResult | null;
}

/**
 * Converts the fail-closed Sheets snapshot into the minimal read-only UI model.
 * Missing source evidence remains missing; this never fabricates a zero score.
 */
export function buildRhythmFeaturesViewModel(
  snapshot: RhythmFeaturesSnapshot,
): RhythmFeaturesViewModel {
  if (snapshot.state !== 'ready') {
    return {
      state: snapshot.state,
      notice: snapshot.notice,
      result: null,
    };
  }

  const result = buildRhythmStability(snapshot.input);
  return {
    state: result.score === null ? 'insufficient' : 'ready',
    notice: null,
    result,
  };
}

type Cell = string | number | boolean | null;
type Row = readonly Cell[];

const EXPLICIT_OFFSET_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?\s*(?:Z|[+-]\d{2}:?\d{2})$/;

function textCell(value: Cell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function validDate(value: Cell | undefined): string | null {
  const text = textCell(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
}

function explicitOffsetTimestamp(value: Cell | undefined): string | null {
  const text = textCell(value);
  if (!text || !EXPLICIT_OFFSET_RE.test(text) || !Number.isFinite(Date.parse(text))) return null;
  return text;
}

function availability(value: Cell | undefined): RhythmFeatureAvailability | null {
  const text = textCell(value);
  if (text === 'available' || text === 'missing' || text === 'invalid' || text === 'preserved') {
    return text;
  }
  return null;
}

function nullableIsoTimestamp(value: Cell | undefined): string | null | undefined {
  const text = textCell(value);
  if (!text) return null;
  return Number.isFinite(Date.parse(text)) ? text : undefined;
}

function headersMatch(row: Row | undefined): boolean {
  if (!row || row.length < HEALTH_RHYTHM_FEATURES_HEADERS.length) return false;
  return HEALTH_RHYTHM_FEATURES_HEADERS.every((header, index) => textCell(row[index]) === header);
}

function hourlyActivity(
  date: string,
  raw: Cell | undefined,
  state: RhythmFeatureAvailability,
): RhythmActivityObservation | null | undefined {
  const text = textCell(raw);
  if (state === 'missing' || state === 'invalid') {
    return text === null ? null : undefined;
  }
  if (text === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;

  const seen = new Set<number>();
  const hours: { hour: number; steps: number | null }[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const hour = record.hour;
    const steps = record.steps;
    if (
      !Number.isInteger(hour) ||
      (hour as number) < 0 ||
      (hour as number) > 23 ||
      seen.has(hour as number) ||
      typeof steps !== 'number' ||
      !Number.isFinite(steps) ||
      steps < 0
    ) {
      return undefined;
    }
    seen.add(hour as number);
    hours.push({ hour: hour as number, steps });
  }

  return { date, hours: hours.sort((a, b) => a.hour - b.hour) };
}

function sleepObservation(
  date: string,
  startRaw: Cell | undefined,
  endRaw: Cell | undefined,
  state: RhythmFeatureAvailability,
): RhythmSleepObservation | null | undefined {
  const startText = textCell(startRaw);
  const endText = textCell(endRaw);
  if (state === 'missing' || state === 'invalid') {
    return startText === null && endText === null ? null : undefined;
  }

  const sleepStart = explicitOffsetTimestamp(startRaw);
  const sleepEnd = explicitOffsetTimestamp(endRaw);
  if (!sleepStart || !sleepEnd) return undefined;
  if (Date.parse(sleepEnd) <= Date.parse(sleepStart)) return undefined;
  return { date, sleepStart, sleepEnd };
}

function toInput(days: readonly RhythmFeatureDay[]): RhythmStabilityInput {
  const sleep = days
    .map((day) => day.sleep)
    .filter((value): value is RhythmSleepObservation => value !== null);
  const activity = days
    .map((day) => day.activity)
    .filter((value): value is RhythmActivityObservation => value !== null);
  return { sleep, activity };
}

function noticeFor(code: SheetReadCode): string {
  if (code === 'not-configured') return 'Google Sheets no está configurado.';
  if (code === 'permission-error') {
    return 'La integración no puede leer Health Rhythm Features.';
  }
  if (code === 'missing-tab') return 'Falta la pestaña Health Rhythm Features.';
  if (code === 'auth-error') return 'No se pudo autenticar la lectura de Health Rhythm Features.';
  return 'No se pudo leer Health Rhythm Features.';
}

function failureSnapshot(code: SheetReadCode): RhythmFeaturesSnapshot {
  return {
    state:
      code === 'not-configured' || code === 'permission-error' || code === 'missing-tab'
        ? 'unavailable'
        : 'error',
    notice: noticeFor(code),
    days: [],
    input: { sleep: [], activity: [] },
  };
}

export function parseRhythmFeatureValues(values: readonly Row[]): RhythmFeaturesSnapshot {
  if (values.length === 0) {
    return {
      state: 'error',
      notice: 'Health Rhythm Features no contiene encabezados.',
      days: [],
      input: { sleep: [], activity: [] },
    };
  }
  if (!headersMatch(values[0])) {
    return {
      state: 'error',
      notice: 'El esquema de Health Rhythm Features no coincide con el contrato.',
      days: [],
      input: { sleep: [], activity: [] },
    };
  }

  const days: RhythmFeatureDay[] = [];
  const seenDates = new Set<string>();

  for (const row of values.slice(1)) {
    if (row.every((cell) => textCell(cell) === null)) continue;

    const date = validDate(row[0]);
    const sleepAvailability = availability(row[4]);
    const activityAvailability = availability(row[5]);
    const sleepSourceModifiedAt = nullableIsoTimestamp(row[6]);
    const rhythmSourceModifiedAt = nullableIsoTimestamp(row[7]);
    const featureVersion = textCell(row[8]);

    if (
      !date ||
      seenDates.has(date) ||
      !sleepAvailability ||
      !activityAvailability ||
      sleepSourceModifiedAt === undefined ||
      rhythmSourceModifiedAt === undefined ||
      featureVersion !== HEALTH_RHYTHM_FEATURE_VERSION
    ) {
      return {
        state: 'error',
        notice: 'Health Rhythm Features contiene una fila inválida.',
        days: [],
        input: { sleep: [], activity: [] },
      };
    }

    const sleep = sleepObservation(date, row[1], row[2], sleepAvailability);
    const activity = hourlyActivity(date, row[3], activityAvailability);
    if (sleep === undefined || activity === undefined) {
      return {
        state: 'error',
        notice: 'Health Rhythm Features contiene una fila inválida.',
        days: [],
        input: { sleep: [], activity: [] },
      };
    }

    seenDates.add(date);
    days.push({
      date,
      sleep,
      activity,
      sleepAvailability,
      activityAvailability,
      sleepSourceModifiedAt,
      rhythmSourceModifiedAt,
      featureVersion: HEALTH_RHYTHM_FEATURE_VERSION,
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return {
    state: days.length === 0 ? 'empty' : 'ready',
    notice: days.length === 0 ? 'Health Rhythm Features todavía no tiene días normalizados.' : null,
    days,
    input: toInput(days),
  };
}

export async function loadRhythmFeaturesSnapshot(
  read: (tab: string) => Promise<ReadTabResult> = readTabValues,
): Promise<RhythmFeaturesSnapshot> {
  const result = await read(HEALTH_RHYTHM_FEATURES_TAB);
  if (!result.ok) return failureSnapshot(result.code);
  return parseRhythmFeatureValues(result.values);
}
