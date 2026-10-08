export const HABIT_REGISTRY_TAB = 'Habit Registry';
export const HABIT_LOG_V2_TAB = 'Habit Log V2';
export const HABIT_REGISTRY_VERSION = 'habit-registry-v2';
export const HABIT_LOG_V2_VERSION = 'habit-log-v2';

export const HABIT_REGISTRY_HEADERS = [
  'Habit ID',
  'Nombre',
  'Icono',
  'Activo',
  'Modo',
  'Cadencia',
  'Objetivo',
  'Unidad',
  'Valid From',
  'Valid To',
  'Derived Source',
  'Legacy Header',
  'Version',
] as const;

export const HABIT_LOG_V2_HEADERS = [
  'Entry ID',
  'Fecha',
  'Habit ID',
  'Valor',
  'Fuente',
  'Replaces Entry ID',
  'Registrado en',
  'Version',
] as const;

export type HabitV2Mode = 'manual' | 'derived';
export type HabitV2Cadence = 'daily' | 'weekly';
export type HabitLogV2Source = 'manual' | 'manual-correction' | 'migration';
export type HabitV2DayState = 'done' | 'pending' | 'missed' | 'unavailable';
export type HabitV2ValueOrigin = 'log' | 'legacy' | 'gym-session' | 'none' | 'unavailable';

export interface HabitRegistryRecord {
  rowNumber: number;
  habitId: string;
  name: string;
  icon: string | null;
  active: boolean;
  mode: HabitV2Mode;
  cadence: HabitV2Cadence;
  target: number;
  unit: string;
  validFrom: string | null;
  validTo: string | null;
  derivedSource: string | null;
  legacyHeader: string | null;
  version: typeof HABIT_REGISTRY_VERSION;
}

export interface HabitLogV2Record {
  rowNumber: number;
  entryId: string;
  date: string;
  habitId: string;
  value: boolean;
  source: HabitLogV2Source;
  replacesEntryId: string | null;
  registeredAt: string;
  version: typeof HABIT_LOG_V2_VERSION;
}

export type ParsedRegistry =
  { ok: true; rows: HabitRegistryRecord[] } | { ok: false; reason: string };

export type ParsedHabitLog = { ok: true; rows: HabitLogV2Record[] } | { ok: false; reason: string };

export interface HabitManualEffectiveValue {
  ok: boolean;
  value: boolean | null;
  origin: HabitV2ValueOrigin;
  entryId: string | null;
  reason: string | null;
}

export interface HabitV2Item {
  habitId: string;
  name: string;
  icon: string | null;
  mode: HabitV2Mode;
  cadence: HabitV2Cadence;
  target: number;
  unit: string;
  state: HabitV2DayState;
  value: boolean | null;
  origin: HabitV2ValueOrigin;
  automatic: boolean;
  active: boolean;
  weeklyCompleted: number | null;
  weeklyCoverageComplete: boolean;
}

export interface HabitsV2View {
  status: 'ready' | 'empty' | 'unavailable' | 'error';
  notice: string | null;
  targetDate: string;
  today: string;
  writable: boolean;
  items: readonly HabitV2Item[];
}

export type HabitV2MutationResult =
  | { ok: true; code: 'applied' | 'idempotent'; message: string }
  | {
      ok: false;
      code:
        'disabled' | 'invalid' | 'conflict' | 'unavailable' | 'not-found' | 'verification-failed';
      message: string;
    };

export interface ToggleHabitV2Input {
  targetDate: string;
  habitId: string;
  nextValue: boolean;
  expectedPreviousValue: boolean;
  operationId: string;
}

export interface AddHabitV2Input {
  name: string;
  icon: string | null;
  cadence: HabitV2Cadence;
  target: number;
  unit: string;
  operationId: string;
}

export interface DeactivateHabitV2Input {
  habitId: string;
  expectedActive: boolean;
  operationId: string;
}

type Cell = string | number | boolean | null | undefined;

function textCell(value: Cell): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function booleanCell(value: Cell): boolean | null {
  if (typeof value === 'boolean') return value;
  const text = textCell(value)?.toLowerCase();
  if (!text) return null;
  if (['true', '1', 'yes', 'sí', 'si'].includes(text)) return true;
  if (['false', '0', 'no'].includes(text)) return false;
  return null;
}

function positiveInteger(value: Cell): number | null {
  const text = textCell(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function validYmd(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function headersMatch(values: readonly (readonly Cell[])[], expected: readonly string[]): boolean {
  const header = values[0] ?? [];
  return expected.every((name, index) => textCell(header[index]) === name);
}

export function parseHabitRegistryTable(values: readonly (readonly Cell[])[]): ParsedRegistry {
  if (!headersMatch(values, HABIT_REGISTRY_HEADERS)) {
    return { ok: false, reason: 'Habit Registry no coincide con el contrato V2.' };
  }

  const rows: HabitRegistryRecord[] = [];
  const seen = new Set<string>();

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const habitId = textCell(row[0]);
    if (!habitId) continue;

    const name = textCell(row[1]);
    const active = booleanCell(row[3]);
    const mode = textCell(row[4]);
    const cadence = textCell(row[5]);
    const target = positiveInteger(row[6]);
    const unit = textCell(row[7]) ?? 'vez';
    const validFrom = textCell(row[8]);
    const validTo = textCell(row[9]);
    const derivedSource = textCell(row[10]);
    const legacyHeader = textCell(row[11]);
    const version = textCell(row[12]);

    if (
      !name ||
      active === null ||
      (mode !== 'manual' && mode !== 'derived') ||
      (cadence !== 'daily' && cadence !== 'weekly') ||
      target === null ||
      (validFrom !== null && !validYmd(validFrom)) ||
      (validTo !== null && !validYmd(validTo)) ||
      version !== HABIT_REGISTRY_VERSION ||
      (mode === 'manual' && derivedSource !== null) ||
      (mode === 'derived' && derivedSource === null) ||
      seen.has(habitId)
    ) {
      return { ok: false, reason: 'Habit Registry contiene una fila V2 inválida o duplicada.' };
    }

    seen.add(habitId);
    rows.push({
      rowNumber: index + 1,
      habitId,
      name,
      icon: textCell(row[2]),
      active,
      mode,
      cadence,
      target,
      unit,
      validFrom,
      validTo,
      derivedSource,
      legacyHeader,
      version: HABIT_REGISTRY_VERSION,
    });
  }

  return { ok: true, rows };
}

export function parseHabitLogV2Table(values: readonly (readonly Cell[])[]): ParsedHabitLog {
  if (!headersMatch(values, HABIT_LOG_V2_HEADERS)) {
    return { ok: false, reason: 'Habit Log V2 no coincide con el contrato V2.' };
  }

  const rows: HabitLogV2Record[] = [];
  const ids = new Map<string, HabitLogV2Record>();

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const entryId = textCell(row[0]);
    if (!entryId) continue;

    const date = textCell(row[1]);
    const habitId = textCell(row[2]);
    const value = booleanCell(row[3]);
    const source = textCell(row[4]);
    const replacesEntryId = textCell(row[5]);
    const registeredAt = textCell(row[6]);
    const version = textCell(row[7]);

    if (
      !validYmd(date) ||
      !habitId ||
      value === null ||
      (source !== 'manual' && source !== 'manual-correction' && source !== 'migration') ||
      !registeredAt ||
      version !== HABIT_LOG_V2_VERSION
    ) {
      return { ok: false, reason: 'Habit Log V2 contiene una fila inválida.' };
    }

    const mapped: HabitLogV2Record = {
      rowNumber: index + 1,
      entryId,
      date,
      habitId,
      value,
      source,
      replacesEntryId,
      registeredAt,
      version: HABIT_LOG_V2_VERSION,
    };

    if (ids.has(entryId)) {
      // One operation must map to exactly one physical row.
      return { ok: false, reason: 'Habit Log V2 contiene Entry ID duplicado.' };
    }

    ids.set(entryId, mapped);
    rows.push(mapped);
  }

  return { ok: true, rows };
}

export function resolveHabitLogHead(
  rows: readonly HabitLogV2Record[],
  habitId: string,
  date: string,
): { ok: true; row: HabitLogV2Record | null } | { ok: false; reason: string } {
  const candidates = rows.filter((row) => row.habitId === habitId && row.date === date);
  if (candidates.length === 0) return { ok: true, row: null };

  const byId = new Map(candidates.map((row) => [row.entryId, row]));
  const children = new Map<string, HabitLogV2Record[]>();
  const roots: HabitLogV2Record[] = [];

  for (const row of candidates) {
    if (!row.replacesEntryId) {
      roots.push(row);
      continue;
    }
    const parent = byId.get(row.replacesEntryId);
    if (!parent || parent.rowNumber >= row.rowNumber) {
      return { ok: false, reason: 'Cadena de corrección V2 inválida.' };
    }
    const list = children.get(parent.entryId) ?? [];
    list.push(row);
    children.set(parent.entryId, list);
  }

  if (roots.length !== 1) {
    return { ok: false, reason: 'Habit Log V2 tiene cadenas paralelas para la misma fecha.' };
  }

  let current = roots[0]!;
  const visited = new Set<string>([current.entryId]);

  while (true) {
    const next = children.get(current.entryId) ?? [];
    if (next.length === 0) break;
    if (next.length !== 1) {
      return { ok: false, reason: 'Habit Log V2 tiene una corrección ramificada.' };
    }
    current = next[0]!;
    if (visited.has(current.entryId)) {
      return { ok: false, reason: 'Habit Log V2 contiene un ciclo.' };
    }
    visited.add(current.entryId);
  }

  if (visited.size !== candidates.length) {
    return { ok: false, reason: 'Habit Log V2 contiene una cadena incompleta.' };
  }

  return { ok: true, row: current };
}

function findLegacyValue(
  values: readonly (readonly Cell[])[],
  date: string,
  legacyHeader: string,
): { ok: boolean; value: boolean | null } {
  const header = values[0] ?? [];
  const dateIndex = header.findIndex((value) => textCell(value) === 'Fecha');
  const habitIndex = header.findIndex((value) => textCell(value) === legacyHeader);
  if (dateIndex < 0 || habitIndex < 0) return { ok: false, value: null };

  const matches = values.slice(1).filter((row) => textCell(row[dateIndex])?.slice(0, 10) === date);
  if (matches.length > 1) return { ok: false, value: null };
  if (matches.length === 0) return { ok: true, value: null };
  return { ok: true, value: booleanCell(matches[0]?.[habitIndex]) };
}

export function habitAppliesOnDate(habit: HabitRegistryRecord, date: string): boolean {
  if (habit.validFrom && date < habit.validFrom) return false;
  if (habit.validTo && date > habit.validTo) return false;
  if (!habit.active && !habit.validTo) return false;
  return true;
}

export function resolveManualHabitValue(input: {
  habit: HabitRegistryRecord;
  date: string;
  today: string;
  logRows: readonly HabitLogV2Record[];
  legacyValues: readonly (readonly Cell[])[] | null;
}): HabitManualEffectiveValue {
  const head = resolveHabitLogHead(input.logRows, input.habit.habitId, input.date);
  if (!head.ok) {
    return {
      ok: false,
      value: null,
      origin: 'unavailable',
      entryId: null,
      reason: head.reason,
    };
  }

  if (head.row) {
    return {
      ok: true,
      value: head.row.value,
      origin: 'log',
      entryId: head.row.entryId,
      reason: null,
    };
  }

  if (input.habit.legacyHeader) {
    if (!input.legacyValues) {
      return {
        ok: false,
        value: null,
        origin: 'unavailable',
        entryId: null,
        reason: 'El historial legacy requerido no está disponible.',
      };
    }
    const legacy = findLegacyValue(input.legacyValues, input.date, input.habit.legacyHeader);
    if (!legacy.ok) {
      return {
        ok: false,
        value: null,
        origin: 'unavailable',
        entryId: null,
        reason: 'El historial legacy no pudo resolverse de forma única.',
      };
    }
    if (legacy.value !== null) {
      return {
        ok: true,
        value: legacy.value,
        origin: 'legacy',
        entryId: null,
        reason: null,
      };
    }
  }

  return {
    ok: true,
    value: false,
    origin: 'none',
    entryId: null,
    reason: null,
  };
}

export function dayStateFromValue(
  value: boolean | null,
  date: string,
  today: string,
): HabitV2DayState {
  if (value === null) return 'unavailable';
  if (value) return 'done';
  return date < today ? 'missed' : 'pending';
}

export function deriveGymHabitValue(
  snapshot: {
    state: 'ready' | 'empty' | 'unavailable' | 'error';
    summaries: readonly { date: string; completed: boolean | null }[];
  },
  date: string,
  today: string,
): { state: HabitV2DayState; value: boolean | null; origin: HabitV2ValueOrigin } {
  if (snapshot.state === 'unavailable' || snapshot.state === 'error') {
    return { state: 'unavailable', value: null, origin: 'unavailable' };
  }

  const matches = snapshot.summaries.filter((summary) => summary.date === date);
  if (matches.some((summary) => summary.completed === true)) {
    return { state: 'done', value: true, origin: 'gym-session' };
  }
  if (matches.some((summary) => summary.completed === null)) {
    return { state: 'unavailable', value: null, origin: 'unavailable' };
  }

  return {
    state: date < today ? 'missed' : 'pending',
    value: false,
    origin: 'gym-session',
  };
}

export function weekDatesThrough(date: string): string[] {
  if (!validYmd(date)) return [];
  const [year, month, day] = date.split('-').map(Number);
  const current = new Date(Date.UTC(year!, month! - 1, day!));
  const weekday = current.getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  const start = new Date(current);
  start.setUTCDate(start.getUTCDate() - mondayOffset);

  const dates: string[] = [];
  for (
    let cursor = new Date(start);
    cursor <= current;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}
