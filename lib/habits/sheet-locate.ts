/**
 * Utilidades A1 y resolución de filas/columnas para escritura de una sola celda.
 */
import { parseSheetDate } from '@/lib/adapters/dates';
import { toBoolean } from '@/lib/adapters/cells';
import { RD, REGISTRO_DIARIO_TAB } from '@/lib/google/constants';
import { buildHeaderIndex } from '@/lib/validation/headers';

/** Convierte índice 1-based de columna a letra A1 (1→A, 27→AA). */
export function columnIndexToA1(columnNumber: number): string {
  if (!Number.isInteger(columnNumber) || columnNumber < 1) {
    throw new Error('invalid-column');
  }
  let n = columnNumber;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** Rango A1 de una sola celda en Registro diario. */
export function habitCellRange(rowNumber: number, columnNumber: number): string {
  return `${REGISTRO_DIARIO_TAB}!${columnIndexToA1(columnNumber)}${rowNumber}`;
}

export type DateRowLookup =
  | { kind: 'ok'; rowNumber: number; rowIndex0: number }
  | { kind: 'none' }
  | { kind: 'duplicate'; count: number };

/**
 * Busca filas cuya columna Fecha coincide con targetDate (YYYY-MM-DD).
 * rowNumber es 1-based en el Sheet (fila 1 = encabezados).
 */
export function findRowsForDate(values: readonly unknown[][], targetDate: string): DateRowLookup {
  if (values.length === 0) return { kind: 'none' };
  const header = values[0] ?? [];
  const index = buildHeaderIndex(header);
  const fechaCol = index.get(RD.fecha);
  if (fechaCol === undefined) return { kind: 'none' };

  const matches: number[] = [];
  for (let r = 1; r < values.length; r += 1) {
    const row = values[r] ?? [];
    const parsed = parseSheetDate(row[fechaCol]);
    if (parsed === targetDate) matches.push(r + 1);
  }

  if (matches.length === 0) return { kind: 'none' };
  if (matches.length > 1) return { kind: 'duplicate', count: matches.length };
  return { kind: 'ok', rowNumber: matches[0], rowIndex0: matches[0] - 1 };
}

/** Índice 1-based de columna para un encabezado, o null si falta / no es único. */
export function findHabitColumn(headerRow: readonly unknown[], habitName: string): number | null {
  const index = buildHeaderIndex(headerRow);
  const zeroBased = index.get(habitName);
  if (zeroBased === undefined) return null;
  return zeroBased + 1;
}

/**
 * Interpreta el valor de una celda de hábito para comparación de escritura.
 * Vacío se trata como false (no completado) para expectedPreviousValue.
 */
export function coerceHabitBoolean(raw: unknown): boolean | null {
  const cell = toBoolean(raw);
  if (cell.kind === 'value') return cell.value;
  if (cell.kind === 'empty') return false;
  return null;
}

/** YYYY-MM-DD estricto. */
export function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
