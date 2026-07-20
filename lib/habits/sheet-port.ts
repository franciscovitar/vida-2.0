/**
 * Puerto de hoja para toggles de hábito (inyectable en pruebas).
 * La implementación real escribe exactamente una celda vía Sheets API.
 */
export interface HabitSheetPort {
  /** Lee toda la pestaña Registro diario (valores planos). */
  readRegistroDiario(): Promise<
    | { ok: true; values: unknown[][] }
    | { ok: false; code: 'permission-error' | 'auth-error' | 'write-error' | 'not-configured' }
  >;
  /** Lee una sola celda (A1 completo). */
  readCell(
    rangeA1: string,
  ): Promise<
    | { ok: true; value: unknown }
    | { ok: false; code: 'permission-error' | 'auth-error' | 'write-error' }
  >;
  /** Escribe un booleano en una sola celda. */
  writeCell(
    rangeA1: string,
    value: boolean,
  ): Promise<{ ok: true } | { ok: false; code: 'permission-error' | 'auth-error' | 'write-error' }>;
}
