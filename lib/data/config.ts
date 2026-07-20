/**
 * Lectura de configuración desde variables de entorno.
 *
 * No contiene secretos: solo lee `process.env` en el servidor. La clave privada
 * nunca se expone ni se registra.
 */
import type { DataSourceKind } from '@/types';

/** Devuelve el origen de datos configurado. Por defecto, mocks. */
export function getDataSource(): DataSourceKind {
  return process.env.DATA_SOURCE === 'google' ? 'google' : 'mock';
}

export interface GoogleConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

export type GoogleConfigResult =
  { ok: true; config: GoogleConfig } | { ok: false; reason: 'not-configured' };

/**
 * Normaliza la clave privada: las variables de entorno suelen guardar los
 * saltos de línea como `\n` literales.
 */
export function normalizePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

/**
 * Lee la configuración de Google. Devuelve `not-configured` (sin lanzar) cuando
 * falta cualquiera de las variables, para que la app siga funcionando con mocks.
 */
export function getGoogleConfig(): GoogleConfigResult {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEETS_DEV_ID?.trim();

  if (!clientEmail || !rawKey || rawKey.trim() === '' || !spreadsheetId) {
    return { ok: false, reason: 'not-configured' };
  }

  return {
    ok: true,
    config: {
      clientEmail,
      privateKey: normalizePrivateKey(rawKey),
      spreadsheetId,
    },
  };
}
