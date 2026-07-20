/**
 * Serialización segura para el límite Server Component → Client Component.
 *
 * Solo pueden atravesar props valores JSON planos (string, number, boolean, null,
 * arrays y objetos de esos tipos). Nunca Error, Buffer, ArrayBuffer ni objetos
 * de googleapis/gaxios.
 */
import type { TodayData } from '@/types';

/** Celda del Sheet ya normalizada a un valor JSON plano. */
export type PlainCell = string | number | boolean | null;

/** Fila del Sheet con celdas planas. */
export type PlainSheetRow = PlainCell[];

/** Convierte un valor crudo del Sheet a un tipo JSON plano. */
export function sanitizeCell(raw: unknown): PlainCell {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) return null;
  if (typeof raw === 'object') return null;
  return String(raw);
}

/** Normaliza la matriz de valores del Sheet a celdas planas. */
export function sanitizeSheetValues(values: readonly unknown[][]): PlainSheetRow[] {
  return values.map((row) => (Array.isArray(row) ? row.map(sanitizeCell) : []));
}

/** Replacer de JSON.stringify que descarta tipos no serializables. */
function plainReplacer(_key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return null;
  if (value instanceof Error) return undefined;
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  return value;
}

/** Garantiza que TodayData sea un objeto plano serializable para React. */
export function toPlainTodayData(data: TodayData): TodayData {
  return JSON.parse(JSON.stringify(data, plainReplacer)) as TodayData;
}

/** true si el valor puede serializarse con JSON.stringify sin lanzar. */
export function isJsonPlain(value: unknown): boolean {
  try {
    JSON.stringify(value, plainReplacer);
    return true;
  } catch {
    return false;
  }
}
