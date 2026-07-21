/**
 * Validación del Spreadsheet ID contra el ID resuelto del target actual.
 *
 * No hay whitelist hardcodeada de IDs. El único ID válido es el que devolvió
 * resolveSpreadsheetTarget / getGoogleConfig desde variables server-only.
 */

/** Error tipado cuando el ID no coincide con el resuelto. */
export class DisallowedSpreadsheetError extends Error {
  constructor() {
    super('El ID de spreadsheet no está autorizado para el target actual.');
    this.name = 'DisallowedSpreadsheetError';
  }
}

/** true solo si candidate coincide exactamente con el ID resuelto (no vacío). */
export function isResolvedSpreadsheetId(candidate: string, resolvedId: string): boolean {
  return candidate.length > 0 && resolvedId.length > 0 && candidate === resolvedId;
}

/** Lanza si candidate no es el ID resuelto del target. */
export function assertResolvedSpreadsheetId(candidate: string, resolvedId: string): void {
  if (!isResolvedSpreadsheetId(candidate, resolvedId)) {
    throw new DisallowedSpreadsheetError();
  }
}
