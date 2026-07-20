/**
 * Lista blanca de spreadsheets permitidos.
 *
 * En la Fase 2A la integración es exclusivamente de lectura contra el Sheet
 * DEV. Cualquier otro ID (incluido el de producción) se rechaza de forma
 * explícita para que nunca se lea ni se escriba producción por accidente.
 */

/** Único spreadsheet permitido: "Sistema de hábitos y compromisos — DEV". */
export const ALLOWED_SPREADSHEET_ID = '1TBrEQuocPSNv9SradWea2YWQtMpOEIsHHNRJe0YACdY';

/** Error tipado cuando se intenta usar un spreadsheet no permitido. */
export class DisallowedSpreadsheetError extends Error {
  constructor() {
    super('El ID de spreadsheet no está permitido. Solo se admite el Sheet DEV.');
    this.name = 'DisallowedSpreadsheetError';
  }
}

/** true solo si el ID coincide exactamente con el Sheet DEV. */
export function isAllowedSpreadsheetId(id: string): boolean {
  return id === ALLOWED_SPREADSHEET_ID;
}

/** Lanza `DisallowedSpreadsheetError` si el ID no es el Sheet DEV. */
export function assertAllowedSpreadsheetId(id: string): void {
  if (!isAllowedSpreadsheetId(id)) {
    throw new DisallowedSpreadsheetError();
  }
}
