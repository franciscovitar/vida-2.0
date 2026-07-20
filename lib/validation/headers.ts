/**
 * Validación y mapeo de encabezados por nombre.
 *
 * Los adapters no dependen de posiciones fijas: construyen un índice
 * nombre → columna y validan que existan los encabezados requeridos. Si falta
 * alguno, se lanza un código plano (`MissingHeaderCode`), no una instancia de Error.
 */
import type { MissingHeaderCode } from '@/lib/google/errors';

/** Construye un índice nombre → índice de columna a partir de la fila de encabezados. */
export function buildHeaderIndex(headerRow: readonly unknown[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((cell, position) => {
    if (typeof cell === 'string') {
      const name = cell.trim();
      if (name !== '' && !index.has(name)) {
        index.set(name, position);
      }
    }
  });
  return index;
}

function throwMissingHeader(tab: string, missing: string[]): never {
  const code: MissingHeaderCode = { code: 'missing-header', tab, missing };
  throw code;
}

/** Lanza un código plano si falta alguno de los encabezados requeridos. */
export function requireHeaders(
  index: Map<string, number>,
  required: readonly string[],
  tab: string,
): void {
  const missing = required.filter((name) => !index.has(name));
  if (missing.length > 0) {
    throwMissingHeader(tab, missing);
  }
}

/**
 * Devuelve el índice de columna de un encabezado ya validado.
 * Lanza un código plano si no existe (defensivo, no debería ocurrir tras
 * `requireHeaders`).
 */
export function columnIndex(index: Map<string, number>, name: string, tab: string): number {
  const position = index.get(name);
  if (position === undefined) {
    throwMissingHeader(tab, [name]);
  }
  return position;
}
