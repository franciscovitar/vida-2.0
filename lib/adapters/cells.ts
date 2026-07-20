/**
 * Parseo de celdas del Sheet con semántica estricta.
 *
 * Se diferencia de forma explícita:
 * - `empty`: la celda existe pero está vacía;
 * - `value`: hay un dato real (incluye 0 y false);
 * - `error`: la celda tiene contenido que no se pudo interpretar.
 *
 * El cero NO se convierte en "sin dato" y el false se conserva como false.
 */

export type Cell<T> =
  { kind: 'value'; value: T } | { kind: 'empty' } | { kind: 'error'; raw: unknown };

/** Devuelve el valor crudo de una columna, o `undefined` si la fila es más corta. */
export function rawCell(row: readonly unknown[], index: number): unknown {
  return index >= 0 && index < row.length ? row[index] : undefined;
}

function isBlank(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
}

/** Texto no vacío. Preserva "0" y cadenas con contenido. */
export function toText(raw: unknown): Cell<string> {
  if (isBlank(raw)) return { kind: 'empty' };
  if (typeof raw === 'string') return { kind: 'value', value: raw.trim() };
  return { kind: 'value', value: String(raw) };
}

/** Número. Conserva el 0 como valor; contenido no numérico produce `error`. */
export function toNumber(raw: unknown): Cell<number> {
  if (isBlank(raw)) return { kind: 'empty' };
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { kind: 'value', value: raw } : { kind: 'error', raw };
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    const parsed = Number(text);
    if (Number.isFinite(parsed)) return { kind: 'value', value: parsed };
    const withDot = Number(text.replace(',', '.'));
    if (Number.isFinite(withDot)) return { kind: 'value', value: withDot };
    return { kind: 'error', raw };
  }
  return { kind: 'error', raw };
}

const TRUE_TOKENS = new Set(['true', 'verdadero', 'sí', 'si', 'x', '✓', '1']);
const FALSE_TOKENS = new Set(['false', 'falso', 'no', '0']);

/** Booleano. Conserva el false como valor; contenido ambiguo produce `error`. */
export function toBoolean(raw: unknown): Cell<boolean> {
  if (isBlank(raw)) return { kind: 'empty' };
  if (typeof raw === 'boolean') return { kind: 'value', value: raw };
  if (typeof raw === 'number') {
    if (raw === 1) return { kind: 'value', value: true };
    if (raw === 0) return { kind: 'value', value: false };
    return { kind: 'error', raw };
  }
  if (typeof raw === 'string') {
    const token = raw.trim().toLowerCase();
    if (TRUE_TOKENS.has(token)) return { kind: 'value', value: true };
    if (FALSE_TOKENS.has(token)) return { kind: 'value', value: false };
    return { kind: 'error', raw };
  }
  return { kind: 'error', raw };
}
