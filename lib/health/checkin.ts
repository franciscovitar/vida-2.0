import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';

export const HEALTH_CHECKIN_TAB = 'Health Check-ins';
export const HEALTH_CHECKIN_VERSION = 'health-checkin-v1';
export const HEALTH_CHECKIN_NOTE_MAX_LENGTH = 280;
export const HEALTH_CHECKIN_HEADERS = [
  'Date',
  'Energy',
  'Rested',
  'Soreness',
  'Stress',
  'Focus',
  'Workout RPE',
  'Unwell',
  'Note',
  'Updated At',
  'Check-in Version',
] as const;

export type HealthCheckinCell = string | number | boolean | null;

export interface HealthCheckinDraft {
  energy: number | null;
  rested: number | null;
  soreness: number | null;
  stress?: number | null;
  focus?: number | null;
  workoutRpe?: number | null;
  unwell?: boolean | null;
  note?: string | null;
}

export interface HealthCheckinValues {
  energy: number;
  rested: number;
  soreness: number;
  stress: number | null;
  focus: number | null;
  workoutRpe: number | null;
  unwell: boolean | null;
  note: string | null;
}

export interface HealthCheckinRecord {
  date: string;
  values: HealthCheckinValues;
  updatedAt: string;
  version: typeof HEALTH_CHECKIN_VERSION;
  rowNumber: number;
}

export type HealthCheckinSnapshotState = 'ready' | 'unavailable' | 'error';

export interface HealthCheckinSnapshot {
  state: HealthCheckinSnapshotState;
  saved: boolean;
  canWrite: boolean;
  values: HealthCheckinValues | null;
  notice: string | null;
}

export type HealthCheckinWriteCode =
  | 'invalid-value'
  | 'production-disabled'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-tab'
  | 'read-error'
  | 'invalid-schema'
  | 'invalid-row'
  | 'duplicate-date'
  | 'write-error'
  | 'verification-error';

export const HEALTH_CHECKIN_WRITE_MESSAGES: Readonly<Record<HealthCheckinWriteCode, string>> = {
  'invalid-value': 'Revisá los valores del check-in antes de guardar.',
  'production-disabled': 'El check-in todavía no está habilitado para escribir en este entorno.',
  'not-configured': 'El almacenamiento del check-in no está configurado.',
  'auth-error': 'No se pudo autenticar el guardado del check-in.',
  'permission-error': 'La integración no tiene permiso para guardar el check-in.',
  'missing-tab': 'Falta la pestaña Health Check-ins en este entorno.',
  'read-error': 'No se pudo leer Health Check-ins. No se guardó ningún cambio.',
  'invalid-schema': 'El esquema de Health Check-ins no coincide con el contrato.',
  'invalid-row': 'Health Check-ins contiene una fila inválida. No se guardó ningún cambio.',
  'duplicate-date': 'Hay más de una fila para la misma fecha. No se guardó ningún cambio.',
  'write-error': 'No se pudo guardar el check-in.',
  'verification-error': 'El guardado no pudo verificarse. Revisá la fuente antes de reintentar.',
};

export type HealthCheckinWriteResult =
  | {
      ok: true;
      date: string;
      values: HealthCheckinValues;
      savedAt: string;
      replay: boolean;
    }
  | { ok: false; code: HealthCheckinWriteCode; message: string };

export type HealthCheckinPortWriteCode =
  'disabled' | 'not-configured' | 'auth-error' | 'permission-error' | 'write-error';

export type HealthCheckinPortWriteResult =
  { ok: true } | { ok: false; code: HealthCheckinPortWriteCode };

export interface HealthCheckinSheetPort {
  read(): Promise<ReadTabResult>;
  writeRow(
    rowNumber: number,
    row: readonly HealthCheckinCell[],
  ): Promise<HealthCheckinPortWriteResult>;
}

export interface HealthCheckinWriteTarget {
  target: 'dev' | 'prod';
  writesAllowed: boolean;
}

export type HealthCheckinInspection =
  | { ok: true; records: readonly HealthCheckinRecord[]; nextRow: number }
  | { ok: false; code: 'invalid-schema' | 'invalid-row' | 'duplicate-date' };

function failure(code: HealthCheckinWriteCode): HealthCheckinWriteResult {
  return { ok: false, code, message: HEALTH_CHECKIN_WRITE_MESSAGES[code] };
}

function isBlank(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function textCell(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function validYmd(value: unknown): string | null {
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

function integerCell(value: unknown, min: number, max: number): number | null | undefined {
  if (isBlank(value)) return null;
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) return undefined;
  return numeric;
}

function optionalBooleanCell(value: unknown): boolean | null | undefined {
  if (isBlank(value)) return null;
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNoteCell(value: unknown): string | null | undefined {
  if (isBlank(value)) return null;
  if (typeof value !== 'string') return undefined;
  const note = value.trim();
  if (note.length === 0) return null;
  if (note.length > HEALTH_CHECKIN_NOTE_MAX_LENGTH) return undefined;
  return note;
}

function explicitTimestamp(value: unknown): string | null {
  const text = textCell(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) {
    return null;
  }
  return text;
}

function headersMatch(row: readonly unknown[] | undefined): boolean {
  if (!row || row.length < HEALTH_CHECKIN_HEADERS.length) return false;
  if (!HEALTH_CHECKIN_HEADERS.every((header, index) => row[index] === header)) return false;
  return row.slice(HEALTH_CHECKIN_HEADERS.length).every(isBlank);
}

function parseStoredRow(row: readonly unknown[], rowNumber: number): HealthCheckinRecord | null {
  if (row.slice(HEALTH_CHECKIN_HEADERS.length).some((cell) => !isBlank(cell))) return null;

  const date = validYmd(row[0]);
  const energy = integerCell(row[1], 1, 5);
  const rested = integerCell(row[2], 1, 5);
  const soreness = integerCell(row[3], 1, 5);
  const stress = integerCell(row[4], 1, 5);
  const focus = integerCell(row[5], 1, 5);
  const workoutRpe = integerCell(row[6], 1, 10);
  const unwell = optionalBooleanCell(row[7]);
  const note = optionalNoteCell(row[8]);
  const updatedAt = explicitTimestamp(row[9]);
  const version = textCell(row[10]);

  if (
    !date ||
    energy === null ||
    energy === undefined ||
    rested === null ||
    rested === undefined ||
    soreness === null ||
    soreness === undefined ||
    stress === undefined ||
    focus === undefined ||
    workoutRpe === undefined ||
    unwell === undefined ||
    note === undefined ||
    !updatedAt ||
    version !== HEALTH_CHECKIN_VERSION
  ) {
    return null;
  }

  return {
    date,
    values: { energy, rested, soreness, stress, focus, workoutRpe, unwell, note },
    updatedAt,
    version: HEALTH_CHECKIN_VERSION,
    rowNumber,
  };
}

export function inspectHealthCheckinTable(
  values: readonly (readonly HealthCheckinCell[])[],
): HealthCheckinInspection {
  if (!headersMatch(values[0])) return { ok: false, code: 'invalid-schema' };

  const records: HealthCheckinRecord[] = [];
  const seenDates = new Set<string>();
  let firstBlankRow: number | null = null;

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const rowNumber = index + 1;
    if (row.every(isBlank)) {
      firstBlankRow ??= rowNumber;
      continue;
    }

    const record = parseStoredRow(row, rowNumber);
    if (!record) return { ok: false, code: 'invalid-row' };
    if (seenDates.has(record.date)) return { ok: false, code: 'duplicate-date' };
    seenDates.add(record.date);
    records.push(record);
  }

  return {
    ok: true,
    records,
    nextRow: firstBlankRow ?? Math.max(2, values.length + 1),
  };
}

function normalizeRequiredScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : null;
}

function normalizeOptionalScore(value: unknown, max: number): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
    ? value
    : undefined;
}

export function validateHealthCheckinInput(
  input: unknown,
): { ok: true; values: HealthCheckinValues } | { ok: false } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false };
  const record = input as Record<string, unknown>;

  const energy = normalizeRequiredScore(record.energy);
  const rested = normalizeRequiredScore(record.rested);
  const soreness = normalizeRequiredScore(record.soreness);
  const stress = normalizeOptionalScore(record.stress, 5);
  const focus = normalizeOptionalScore(record.focus, 5);
  const workoutRpe = normalizeOptionalScore(record.workoutRpe, 10);
  const unwell =
    record.unwell === null || record.unwell === undefined
      ? null
      : typeof record.unwell === 'boolean'
        ? record.unwell
        : undefined;
  const note = optionalNoteCell(record.note);

  if (
    energy === null ||
    rested === null ||
    soreness === null ||
    stress === undefined ||
    focus === undefined ||
    workoutRpe === undefined ||
    unwell === undefined ||
    note === undefined
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    values: { energy, rested, soreness, stress, focus, workoutRpe, unwell, note },
  };
}

export function buildHealthCheckinRow(
  date: string,
  values: HealthCheckinValues,
  updatedAt: string,
): readonly HealthCheckinCell[] {
  return [
    date,
    values.energy,
    values.rested,
    values.soreness,
    values.stress ?? '',
    values.focus ?? '',
    values.workoutRpe ?? '',
    values.unwell ?? '',
    values.note ?? '',
    updatedAt,
    HEALTH_CHECKIN_VERSION,
  ];
}

function valuesEqual(a: HealthCheckinValues, b: HealthCheckinValues): boolean {
  return (
    a.energy === b.energy &&
    a.rested === b.rested &&
    a.soreness === b.soreness &&
    a.stress === b.stress &&
    a.focus === b.focus &&
    a.workoutRpe === b.workoutRpe &&
    a.unwell === b.unwell &&
    a.note === b.note
  );
}

function readCodeToWriteCode(code: SheetReadCode): HealthCheckinWriteCode {
  if (code === 'not-configured') return 'not-configured';
  if (code === 'auth-error') return 'auth-error';
  if (code === 'permission-error') return 'permission-error';
  if (code === 'missing-tab') return 'missing-tab';
  return 'read-error';
}

function portWriteCodeToWriteCode(code: HealthCheckinPortWriteCode): HealthCheckinWriteCode {
  if (code === 'disabled') return 'production-disabled';
  if (code === 'not-configured') return 'not-configured';
  if (code === 'auth-error') return 'auth-error';
  if (code === 'permission-error') return 'permission-error';
  return 'write-error';
}

function noticeForReadFailure(code: SheetReadCode): string {
  return HEALTH_CHECKIN_WRITE_MESSAGES[readCodeToWriteCode(code)];
}

export function buildHealthCheckinSnapshot(
  read: ReadTabResult,
  targetDate: string,
  canWrite: boolean,
): HealthCheckinSnapshot {
  if (!read.ok) {
    return {
      state:
        read.code === 'missing-tab' ||
        read.code === 'not-configured' ||
        read.code === 'permission-error'
          ? 'unavailable'
          : 'error',
      saved: false,
      canWrite: false,
      values: null,
      notice: noticeForReadFailure(read.code),
    };
  }

  const inspected = inspectHealthCheckinTable(read.values);
  if (!inspected.ok) {
    return {
      state: 'error',
      saved: false,
      canWrite: false,
      values: null,
      notice: HEALTH_CHECKIN_WRITE_MESSAGES[inspected.code],
    };
  }

  const record = inspected.records.find((item) => item.date === targetDate) ?? null;
  return {
    state: 'ready',
    saved: record !== null,
    canWrite,
    values: record?.values ?? null,
    notice: null,
  };
}

export function todayInCordoba(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export async function upsertHealthCheckinWithPort(
  input: unknown,
  port: HealthCheckinSheetPort,
  options: { targetDate: string; now: Date; target: HealthCheckinWriteTarget },
): Promise<HealthCheckinWriteResult> {
  if (options.target.target !== 'dev' || !options.target.writesAllowed) {
    return failure('production-disabled');
  }
  if (!validYmd(options.targetDate) || !Number.isFinite(options.now.getTime())) {
    return failure('invalid-value');
  }

  const validated = validateHealthCheckinInput(input);
  if (!validated.ok) return failure('invalid-value');

  const before = await port.read();
  if (!before.ok) return failure(readCodeToWriteCode(before.code));

  const inspected = inspectHealthCheckinTable(before.values);
  if (!inspected.ok) return failure(inspected.code);

  const existing = inspected.records.find((record) => record.date === options.targetDate) ?? null;
  if (existing && valuesEqual(existing.values, validated.values)) {
    return {
      ok: true,
      date: existing.date,
      values: existing.values,
      savedAt: existing.updatedAt,
      replay: true,
    };
  }

  const rowNumber = existing?.rowNumber ?? inspected.nextRow;
  const updatedAt = options.now.toISOString();
  const row = buildHealthCheckinRow(options.targetDate, validated.values, updatedAt);
  const write = await port.writeRow(rowNumber, row);
  if (!write.ok) return failure(portWriteCodeToWriteCode(write.code));

  const after = await port.read();
  if (!after.ok) return failure('verification-error');
  const verified = inspectHealthCheckinTable(after.values);
  if (!verified.ok) return failure('verification-error');

  const saved = verified.records.find((record) => record.date === options.targetDate) ?? null;
  if (!saved || !valuesEqual(saved.values, validated.values) || saved.updatedAt !== updatedAt) {
    return failure('verification-error');
  }

  return {
    ok: true,
    date: saved.date,
    values: saved.values,
    savedAt: saved.updatedAt,
    replay: false,
  };
}
