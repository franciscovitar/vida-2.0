/**
 * Códigos planos de error de lectura del Sheet.
 *
 * No son instancias de Error: no arrastran cause, request, response ni config
 * de googleapis/gaxios hacia la capa de datos ni la UI.
 */

/** Códigos de fallo al leer una pestaña de Google Sheets. */
export type SheetReadCode =
  'not-configured' | 'auth-error' | 'permission-error' | 'missing-tab' | 'read-error';

/** Resultado de lectura: valores planos o código de error (nunca un Error). */
export type ReadTabResult =
  { ok: true; values: (string | number | boolean | null)[][] } | { ok: false; code: SheetReadCode };

/** Código plano cuando faltan encabezados (sin instancia de Error). */
export interface MissingHeaderCode {
  code: 'missing-header';
  tab: string;
  missing: string[];
}

/** Discrimina un código de encabezado faltante. */
export function isMissingHeaderCode(error: unknown): error is MissingHeaderCode {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MissingHeaderCode).code === 'missing-header'
  );
}
