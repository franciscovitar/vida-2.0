/**
 * Comparación pura DEV → Sheet canónico (hábitos manuales).
 * Sin I/O, sin server-only, sin IDs de spreadsheet.
 */
import { parseSheetDate } from '@/lib/adapters/dates';
import { RD, RD_HABIT_HEADERS, REGISTRO_DIARIO_TAB } from '@/lib/google/constants';
import { isAuthorizedHabitName } from '@/lib/habits/authorized';
import { coerceHabitBoolean, columnIndexToA1, habitCellRange } from '@/lib/habits/sheet-locate';

export type HabitCellClass =
  | 'equal-true'
  | 'candidate-migrate-true'
  | 'preserve-prod-true'
  | 'both-false-or-empty'
  | 'anomaly';

export interface MigrationCandidate {
  date: string;
  habitName: string;
  expectedValue: true;
  a1: string;
  prodState: 'false' | 'empty';
  reason: 'dev-true-prod-false-or-empty';
}

export interface HabitCompareAnomaly {
  date: string | null;
  habitName: string | null;
  kind:
    | 'non-boolean-dev'
    | 'non-boolean-prod'
    | 'duplicate-date-dev'
    | 'duplicate-date-prod'
    | 'missing-prod-row';
}

export interface HabitCompareTotals {
  cellsCompared: number;
  equalTrue: number;
  candidates: number;
  preserveProdTrue: number;
  bothFalseOrEmpty: number;
  anomalies: number;
}

export interface HabitCompareResult {
  ok: true;
  dateRange: { min: string; max: string } | null;
  totals: HabitCompareTotals;
  candidates: MigrationCandidate[];
  anomalies: HabitCompareAnomaly[];
  hasFutureCandidates: boolean;
  proposesCopyingFalse: boolean;
}

export type HabitCompareFailure =
  | { ok: false; reason: 'missing-tab-or-header'; sheet: 'dev' | 'prod'; missing: string[] }
  | { ok: false; reason: 'duplicate-habit-header'; sheet: 'dev' | 'prod'; header: string };

function countHeaderOccurrences(header: readonly unknown[], name: string): number {
  let count = 0;
  for (const cell of header) {
    if (typeof cell === 'string' && cell.trim() === name) count += 1;
  }
  return count;
}

function validateHabitHeaders(
  header: readonly unknown[],
  sheet: 'dev' | 'prod',
): HabitCompareFailure | Map<string, number> {
  const index = new Map<string, number>();
  const missing: string[] = [];

  for (const name of RD_HABIT_HEADERS) {
    const occurrences = countHeaderOccurrences(header, name);
    if (occurrences === 0) {
      missing.push(name);
      continue;
    }
    if (occurrences > 1) {
      return { ok: false, reason: 'duplicate-habit-header', sheet, header: name };
    }
    // Índice 0-based de la única aparición.
    for (let i = 0; i < header.length; i += 1) {
      const cell = header[i];
      if (typeof cell === 'string' && cell.trim() === name) {
        index.set(name, i);
        break;
      }
    }
  }

  if (typeof header.find((c) => typeof c === 'string' && c.trim() === RD.fecha) !== 'string') {
    // Fecha ausente o no string
  }
  const fechaCount = countHeaderOccurrences(header, RD.fecha);
  if (fechaCount === 0) missing.push(RD.fecha);
  if (fechaCount > 1) {
    return { ok: false, reason: 'duplicate-habit-header', sheet, header: RD.fecha };
  }

  if (missing.length > 0) {
    return { ok: false, reason: 'missing-tab-or-header', sheet, missing };
  }

  for (let i = 0; i < header.length; i += 1) {
    const cell = header[i];
    if (typeof cell === 'string' && cell.trim() === RD.fecha) {
      index.set(RD.fecha, i);
      break;
    }
  }

  return index;
}

function buildDateRowMap(
  values: readonly unknown[][],
  fechaCol: number,
): { byDate: Map<string, number>; duplicateDates: string[] } {
  const byDate = new Map<string, number>();
  const duplicateDates: string[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < values.length; r += 1) {
    const ymd = parseSheetDate(values[r]?.[fechaCol]);
    if (!ymd) continue;
    if (byDate.has(ymd) || seen.has(ymd)) {
      if (!duplicateDates.includes(ymd)) duplicateDates.push(ymd);
      byDate.delete(ymd);
      seen.add(ymd);
      continue;
    }
    seen.add(ymd);
    byDate.set(ymd, r);
  }

  return { byDate, duplicateDates };
}

function classifyCell(
  devRaw: unknown,
  prodRaw: unknown,
): { klass: HabitCellClass; prodState?: 'false' | 'empty' } {
  const dev = coerceHabitBoolean(devRaw);
  const prod = coerceHabitBoolean(prodRaw);

  // Distinguir vacío real en prod para el dry-run (coerce trata vacío como false).
  const prodEmpty =
    prodRaw === undefined ||
    prodRaw === null ||
    (typeof prodRaw === 'string' && prodRaw.trim() === '');

  if (dev === null || prod === null) {
    return { klass: 'anomaly' };
  }

  if (dev === true && prod === true) return { klass: 'equal-true' };
  if (dev === true && prod === false) {
    return { klass: 'candidate-migrate-true', prodState: prodEmpty ? 'empty' : 'false' };
  }
  if (dev === false && prod === true) return { klass: 'preserve-prod-true' };
  return { klass: 'both-false-or-empty' };
}

/**
 * Compara matrices Registro diario (fila 0 = encabezados).
 * Solo hábitos de whitelist; fechas en [devMinDate, todayYmd].
 */
export function compareManualHabits(input: {
  devValues: readonly unknown[][];
  prodValues: readonly unknown[][];
  todayYmd: string;
  authorizedHabits?: readonly string[];
}): HabitCompareResult | HabitCompareFailure {
  const habits = input.authorizedHabits ?? RD_HABIT_HEADERS;
  for (const name of habits) {
    if (!isAuthorizedHabitName(name)) {
      // Defensa: nunca comparar fuera de whitelist.
      return {
        ok: false,
        reason: 'missing-tab-or-header',
        sheet: 'dev',
        missing: [name],
      };
    }
  }

  if (input.devValues.length === 0) {
    return {
      ok: false,
      reason: 'missing-tab-or-header',
      sheet: 'dev',
      missing: [REGISTRO_DIARIO_TAB],
    };
  }
  if (input.prodValues.length === 0) {
    return {
      ok: false,
      reason: 'missing-tab-or-header',
      sheet: 'prod',
      missing: [REGISTRO_DIARIO_TAB],
    };
  }

  const devHeader = input.devValues[0] ?? [];
  const prodHeader = input.prodValues[0] ?? [];

  const devIndex = validateHabitHeaders(devHeader, 'dev');
  if (!(devIndex instanceof Map)) return devIndex;
  const prodIndex = validateHabitHeaders(prodHeader, 'prod');
  if (!(prodIndex instanceof Map)) return prodIndex;

  const fechaDev = devIndex.get(RD.fecha)!;
  const fechaProd = prodIndex.get(RD.fecha)!;

  const devMap = buildDateRowMap(input.devValues, fechaDev);
  const prodMap = buildDateRowMap(input.prodValues, fechaProd);

  const anomalies: HabitCompareAnomaly[] = [];
  for (const d of devMap.duplicateDates) {
    anomalies.push({ date: d, habitName: null, kind: 'duplicate-date-dev' });
  }
  for (const d of prodMap.duplicateDates) {
    anomalies.push({ date: d, habitName: null, kind: 'duplicate-date-prod' });
  }

  const datesInDev = [...devMap.byDate.keys()].sort();
  if (datesInDev.length === 0) {
    return {
      ok: true,
      dateRange: null,
      totals: {
        cellsCompared: 0,
        equalTrue: 0,
        candidates: 0,
        preserveProdTrue: 0,
        bothFalseOrEmpty: 0,
        anomalies: anomalies.length,
      },
      candidates: [],
      anomalies,
      hasFutureCandidates: false,
      proposesCopyingFalse: false,
    };
  }

  const firstDevDay = datesInDev[0];
  const comparableDates = datesInDev.filter((d) => d >= firstDevDay && d <= input.todayYmd);

  const candidates: MigrationCandidate[] = [];
  const candidateKeys = new Set<string>();
  let cellsCompared = 0;
  let equalTrue = 0;
  let preserveProdTrue = 0;
  let bothFalseOrEmpty = 0;
  let hasFutureCandidates = false;
  let proposesCopyingFalse = false;

  for (const date of comparableDates) {
    const devRow = devMap.byDate.get(date);
    if (devRow === undefined) continue;
    const prodRow = prodMap.byDate.get(date);

    for (const habitName of habits) {
      const devCol = devIndex.get(habitName)!;
      const prodCol = prodIndex.get(habitName)!;
      const devRaw = input.devValues[devRow]?.[devCol];
      const prodRaw = prodRow === undefined ? null : input.prodValues[prodRow]?.[prodCol];

      const { klass, prodState } = classifyCell(devRaw, prodRaw);
      cellsCompared += 1;

      if (klass === 'anomaly') {
        const devB = coerceHabitBoolean(devRaw);
        anomalies.push({
          date,
          habitName,
          kind: devB === null ? 'non-boolean-dev' : 'non-boolean-prod',
        });
        continue;
      }

      if (klass === 'equal-true') equalTrue += 1;
      else if (klass === 'preserve-prod-true') preserveProdTrue += 1;
      else if (klass === 'both-false-or-empty') bothFalseOrEmpty += 1;
      else if (klass === 'candidate-migrate-true') {
        if (date > input.todayYmd) {
          hasFutureCandidates = true;
          continue;
        }
        if (prodRow === undefined) {
          anomalies.push({ date, habitName, kind: 'missing-prod-row' });
          continue;
        }
        const key = `${date}::${habitName}`;
        if (candidateKeys.has(key)) continue;
        candidateKeys.add(key);

        const columnNumber = prodCol + 1;
        const rowNumber = prodRow + 1;

        candidates.push({
          date,
          habitName,
          expectedValue: true,
          a1: habitCellRange(rowNumber, columnNumber),
          prodState: prodState ?? 'false',
          reason: 'dev-true-prod-false-or-empty',
        });
      }
    }
  }

  // Defensa: ningún candidato puede ser false ni futuro.
  for (const c of candidates) {
    if (c.expectedValue !== true) proposesCopyingFalse = true;
    if (c.date > input.todayYmd) hasFutureCandidates = true;
    if (!isAuthorizedHabitName(c.habitName)) {
      throw new Error('unauthorized-habit-in-dry-run');
    }
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.habitName.localeCompare(b.habitName));

  return {
    ok: true,
    dateRange:
      comparableDates.length > 0
        ? { min: comparableDates[0], max: comparableDates[comparableDates.length - 1] }
        : null,
    totals: {
      cellsCompared,
      equalTrue,
      candidates: candidates.length,
      preserveProdTrue,
      bothFalseOrEmpty,
      anomalies: anomalies.length,
    },
    candidates,
    anomalies,
    hasFutureCandidates,
    proposesCopyingFalse,
  };
}

/** Utilidad de prueba: construye A1 de una celda de hábito. */
export function buildHabitA1(rowNumber: number, columnNumber: number): string {
  return `${REGISTRO_DIARIO_TAB}!${columnIndexToA1(columnNumber)}${rowNumber}`;
}
