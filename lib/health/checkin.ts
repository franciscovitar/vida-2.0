import { todayInBuenosAires } from '@/lib/adapters/dates';
import { getGoogleConfig } from '@/lib/data/config';
import type {
  SpreadsheetTargetEnv,
  SpreadsheetTargetOk,
} from '@/lib/google/spreadsheet-target-core';

export const HEALTH_CHECKIN_TAB = 'Health Check-ins';
export const HEALTH_CHECKIN_VERSION = 'health-checkin-v1';
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
export const HEALTH_CHECKIN_NOTE_MAX = 280;

export type HealthCheckinCell = string | number | boolean | null;

export interface HealthCheckin {
  date: string;
  energy: number;
  rested: number;
  soreness: number;
  stress: number | null;
  focus: number | null;
  workoutRpe: number | null;
  unwell: boolean | null;
  note: string | null;
  updatedAt: string;
  version: typeof HEALTH_CHECKIN_VERSION;
}

export interface HealthCheckinInput {
  targetDate: string;
  energy: number;
  rested: number;
  soreness: number;
  stress?: number | null;
  focus?: number | null;
  workoutRpe?: number | null;
  unwell?: boolean | null;
  note?: string | null;
  operationId: string;
}

export type HealthCheckinWriteCode =
  | 'invalid-value'
  | 'invalid-schema'
  | 'duplicate-date'
  | 'unauthorized-spreadsheet'
  | 'permission-error'
  | 'write-error'
  | 'verification-failed'
  | 'unauthorized-session';

export const HEALTH_CHECKIN_WRITE_MESSAGES: Readonly<Record<HealthCheckinWriteCode, string>> = {
  'invalid-value': 'Revisá los valores del check-in e intentá de nuevo.',
  'invalid-schema': 'Health Check-ins no coincide con el esquema esperado.',
  'duplicate-date': 'Hay más de una fila para hoy. No se guardó ningún cambio.',
  'unauthorized-spreadsheet': 'Health Check-in V1 no está habilitado para este destino.',
  'permission-error': 'La integración no tiene permiso para guardar el check-in.',
  'write-error': 'No se pudo guardar el check-in.',
  'verification-failed': 'El guardado no pudo verificarse. No se asumió éxito.',
  'unauthorized-session': 'Tenés que iniciar sesión para guardar el check-in.',
};

export type HealthCheckinWriteFailure = {
  ok: false;
  code: HealthCheckinWriteCode;
  operationId: string;
  message: string;
};

export type HealthCheckinWriteSuccess = {
  ok: true;
  operationId: string;
  replay: boolean;
  corrected: boolean;
  rowNumber: number;
  checkin: HealthCheckin;
};

export type HealthCheckinWriteResult = HealthCheckinWriteFailure | HealthCheckinWriteSuccess;

export interface HealthCheckinSheetPort {
  readAll(): Promise<
    | { ok: true; values: HealthCheckinCell[][] }
    | { ok: false; code: 'permission-error' | 'auth-error' | 'read-error' | 'not-configured' }
  >;
  writeRow(
    rangeA1: string,
    values: readonly HealthCheckinCell[],
  ): Promise<
    | { ok: true }
    | { ok: false; code: 'permission-error' | 'auth-error' | 'write-error' | 'not-configured' }
  >;
}

type ParsedRow = { rowNumber: number; checkin: HealthCheckin };

type GridInspection =
  | { ok: true; rows: ParsedRow[]; firstBlankRow: number }
  | { ok: false; code: 'invalid-schema' | 'duplicate-date' };

export type UpsertHealthCheckinOptions = {
  today?: string;
  now?: Date;
  resolved?: SpreadsheetTargetOk;
  env?: SpreadsheetTargetEnv;
};

function fail(code: HealthCheckinWriteCode, operationId: string): HealthCheckinWriteFailure {
  return {
    ok: false,
    code,
    operationId,
    message: HEALTH_CHECKIN_WRITE_MESSAGES[code],
  };
}

function isBlank(value: HealthCheckinCell | undefined): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function text(value: HealthCheckinCell | undefined): string | null {
  if (isBlank(value)) return null;
  return String(value).trim();
}

function isValidYmd(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
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

function integerCell(
  value: HealthCheckinCell | undefined,
  min: number,
  max: number,
  optional: false,
): number | undefined;
function integerCell(
  value: HealthCheckinCell | undefined,
  min: number,
  max: number,
  optional: true,
): number | null | undefined;
function integerCell(
  value: HealthCheckinCell | undefined,
  min: number,
  max: number,
  optional: boolean,
): number | null | undefined {
  if (isBlank(value)) return optional ? null : undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return undefined;
  }
  return value;
}

function optionalBoolean(value: HealthCheckinCell | undefined): boolean | null | undefined {
  if (isBlank(value)) return null;
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNote(value: HealthCheckinCell | undefined): string | null | undefined {
  if (isBlank(value)) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > HEALTH_CHECKIN_NOTE_MAX) return undefined;
  return normalized;
}

function headersMatch(row: readonly HealthCheckinCell[] | undefined): boolean {
  if (!row || row.length < HEALTH_CHECKIN_HEADERS.length) return false;
  return HEALTH_CHECKIN_HEADERS.every((header, index) => text(row[index]) === header);
}

export function parseHealthCheckinRow(row: readonly HealthCheckinCell[]): HealthCheckin | null {
  const date = text(row[0]);
  const energy = integerCell(row[1], 1, 5, false);
  const rested = integerCell(row[2], 1, 5, false);
  const soreness = integerCell(row[3], 1, 5, false);
  const stress = integerCell(row[4], 1, 5, true);
  const focus = integerCell(row[5], 1, 5, true);
  const workoutRpe = integerCell(row[6], 1, 10, true);
  const unwell = optionalBoolean(row[7]);
  const note = optionalNote(row[8]);
  const updatedAt = text(row[9]);
  const version = text(row[10]);

  if (
    !date ||
    !isValidYmd(date) ||
    energy === undefined ||
    rested === undefined ||
    soreness === undefined ||
    stress === undefined ||
    focus === undefined ||
    workoutRpe === undefined ||
    unwell === undefined ||
    note === undefined ||
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    version !== HEALTH_CHECKIN_VERSION
  ) {
    return null;
  }

  return {
    date,
    energy,
    rested,
    soreness,
    stress,
    focus,
    workoutRpe,
    unwell,
    note,
    updatedAt,
    version: HEALTH_CHECKIN_VERSION,
  };
}

function inspectGrid(values: readonly (readonly HealthCheckinCell[])[]): GridInspection {
  if (!headersMatch(values[0])) return { ok: false, code: 'invalid-schema' };

  const rows: ParsedRow[] = [];
  const seenDates = new Set<string>();
  let firstBlankRow = values.length + 1;

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const rowNumber = index + 1;
    if (row.every((cell) => isBlank(cell))) {
      if (firstBlankRow === values.length + 1) firstBlankRow = rowNumber;
      continue;
    }

    const checkin = parseHealthCheckinRow(row);
    if (!checkin) return { ok: false, code: 'invalid-schema' };
    if (seenDates.has(checkin.date)) return { ok: false, code: 'duplicate-date' };
    seenDates.add(checkin.date);
    rows.push({ rowNumber, checkin });
  }

  return { ok: true, rows, firstBlankRow: Math.max(2, firstBlankRow) };
}

function validateInput(
  input: HealthCheckinInput,
): Omit<HealthCheckin, 'updatedAt' | 'version'> | null {
  if (
    typeof input.operationId !== 'string' ||
    input.operationId.trim() === '' ||
    typeof input.targetDate !== 'string' ||
    !isValidYmd(input.targetDate)
  ) {
    return null;
  }

  const energy = integerCell(input.energy, 1, 5, false);
  const rested = integerCell(input.rested, 1, 5, false);
  const soreness = integerCell(input.soreness, 1, 5, false);
  const stress = integerCell(input.stress ?? null, 1, 5, true);
  const focus = integerCell(input.focus ?? null, 1, 5, true);
  const workoutRpe = integerCell(input.workoutRpe ?? null, 1, 10, true);
  const unwell = optionalBoolean(input.unwell ?? null);
  const note = optionalNote(input.note ?? null);

  if (
    energy === undefined ||
    rested === undefined ||
    soreness === undefined ||
    stress === undefined ||
    focus === undefined ||
    workoutRpe === undefined ||
    unwell === undefined ||
    note === undefined
  ) {
    return null;
  }

  return {
    date: input.targetDate,
    energy,
    rested,
    soreness,
    stress,
    focus,
    workoutRpe,
    unwell,
    note,
  };
}

export function healthCheckinToRow(checkin: HealthCheckin): HealthCheckinCell[] {
  return [
    checkin.date,
    checkin.energy,
    checkin.rested,
    checkin.soreness,
    checkin.stress ?? '',
    checkin.focus ?? '',
    checkin.workoutRpe ?? '',
    checkin.unwell ?? '',
    checkin.note ?? '',
    checkin.updatedAt,
    checkin.version,
  ];
}

function sameSubjectiveValues(a: HealthCheckin, b: HealthCheckin): boolean {
  return (
    a.date === b.date &&
    a.energy === b.energy &&
    a.rested === b.rested &&
    a.soreness === b.soreness &&
    a.stress === b.stress &&
    a.focus === b.focus &&
    a.workoutRpe === b.workoutRpe &&
    a.unwell === b.unwell &&
    a.note === b.note &&
    a.version === b.version
  );
}

function resolveWriteTarget(
  options: UpsertHealthCheckinOptions | undefined,
  operationId: string,
): SpreadsheetTargetOk | HealthCheckinWriteFailure {
  if (options?.resolved) return options.resolved;

  const config = getGoogleConfig(options?.env ?? process.env);
  if (!config.ok) return fail('unauthorized-spreadsheet', operationId);

  return {
    ok: true,
    target: config.config.target,
    spreadsheetId: config.config.spreadsheetId,
    allowProdWrites: config.config.allowProdWrites,
    writesAllowed: config.config.writesAllowed,
  };
}

function mapReadFailure(
  code: 'permission-error' | 'auth-error' | 'read-error' | 'not-configured',
  operationId: string,
): HealthCheckinWriteFailure {
  return fail(code === 'permission-error' ? 'permission-error' : 'write-error', operationId);
}

export async function upsertHealthCheckinWithPort(
  input: HealthCheckinInput,
  port: HealthCheckinSheetPort,
  options?: UpsertHealthCheckinOptions,
): Promise<HealthCheckinWriteResult> {
  const operationId = input.operationId;
  const normalized = validateInput(input);
  if (!normalized) return fail('invalid-value', operationId);

  const target = resolveWriteTarget(options, operationId);
  if (!('target' in target)) return target;

  // Production is enabled only through the existing resolved target gate:
  // VERCEL_ENV=production, target=prod and GOOGLE_SHEETS_ALLOW_PROD_WRITES=true.
  if (!target.writesAllowed) {
    return fail('unauthorized-spreadsheet', operationId);
  }

  const today = options?.today ?? todayInBuenosAires();
  if (normalized.date !== today) return fail('invalid-value', operationId);

  const before = await port.readAll();
  if (!before.ok) return mapReadFailure(before.code, operationId);

  const inspected = inspectGrid(before.values);
  if (!inspected.ok) return fail(inspected.code, operationId);

  const sameDay = inspected.rows.filter((row) => row.checkin.date === normalized.date);
  if (sameDay.length > 1) return fail('duplicate-date', operationId);

  const candidate: HealthCheckin = {
    ...normalized,
    updatedAt: (options?.now ?? new Date()).toISOString(),
    version: HEALTH_CHECKIN_VERSION,
  };

  const existing = sameDay[0];
  if (existing && sameSubjectiveValues(existing.checkin, candidate)) {
    return {
      ok: true,
      operationId,
      replay: true,
      corrected: false,
      rowNumber: existing.rowNumber,
      checkin: existing.checkin,
    };
  }

  const rowNumber = existing?.rowNumber ?? inspected.firstBlankRow;
  const rangeA1 = `'${HEALTH_CHECKIN_TAB}'!A${rowNumber}:K${rowNumber}`;
  const written = await port.writeRow(rangeA1, healthCheckinToRow(candidate));
  if (!written.ok) {
    return fail(
      written.code === 'permission-error' ? 'permission-error' : 'write-error',
      operationId,
    );
  }

  const after = await port.readAll();
  if (!after.ok) return fail('verification-failed', operationId);

  const verifiedGrid = inspectGrid(after.values);
  if (!verifiedGrid.ok) return fail('verification-failed', operationId);

  const verified = verifiedGrid.rows.filter((row) => row.checkin.date === normalized.date);
  if (
    verified.length !== 1 ||
    verified[0].rowNumber !== rowNumber ||
    !sameSubjectiveValues(verified[0].checkin, candidate) ||
    verified[0].checkin.updatedAt !== candidate.updatedAt
  ) {
    return fail('verification-failed', operationId);
  }

  return {
    ok: true,
    operationId,
    replay: false,
    corrected: Boolean(existing),
    rowNumber,
    checkin: verified[0].checkin,
  };
}

export function parseHealthCheckinSnapshot(
  values: readonly (readonly HealthCheckinCell[])[],
  targetDate: string,
):
  | { ok: true; today: HealthCheckin | null }
  | { ok: false; code: 'invalid-schema' | 'duplicate-date' } {
  const inspected = inspectGrid(values);
  if (!inspected.ok) return inspected;
  return {
    ok: true,
    today: inspected.rows.find((row) => row.checkin.date === targetDate)?.checkin ?? null,
  };
}
