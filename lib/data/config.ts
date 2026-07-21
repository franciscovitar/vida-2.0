/**
 * Lectura de configuración desde variables de entorno.
 *
 * No contiene secretos: solo lee `process.env` en el servidor. La clave privada
 * nunca se expone ni se registra.
 *
 * El Spreadsheet ID se resuelve vía GOOGLE_SHEETS_TARGET (dev|prod); nunca desde
 * el cliente. Sin hardcodes de ID.
 */
import type { DataSourceKind } from '@/types';
import {
  resolveSpreadsheetTarget,
  type SheetsTargetName,
  type SpreadsheetTargetEnv,
  type SpreadsheetTargetFailReason,
} from '@/lib/google/spreadsheet-target-core';

/** Devuelve el origen de datos configurado. Por defecto, mocks. */
export function getDataSource(): DataSourceKind {
  return process.env.DATA_SOURCE === 'google' ? 'google' : 'mock';
}

export interface GoogleConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  target: SheetsTargetName;
  allowProdWrites: boolean;
  writesAllowed: boolean;
}

export type GoogleConfigResult =
  | { ok: true; config: GoogleConfig }
  | { ok: false; reason: SpreadsheetTargetFailReason | 'not-configured' };

/**
 * Normaliza la clave privada: las variables de entorno suelen guardar los
 * saltos de línea como `\n` literales.
 */
export function normalizePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

/**
 * Lee la configuración de Google (credenciales + target resuelto).
 * Nunca incluye IDs en mensajes de error. No hace fallback entre DEV y PROD.
 */
export function getGoogleConfig(env: SpreadsheetTargetEnv = process.env): GoogleConfigResult {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !rawKey || rawKey.trim() === '') {
    return { ok: false, reason: 'not-configured' };
  }

  const target = resolveSpreadsheetTarget(env);
  if (!target.ok) {
    return { ok: false, reason: target.reason };
  }

  return {
    ok: true,
    config: {
      clientEmail,
      privateKey: normalizePrivateKey(rawKey),
      spreadsheetId: target.spreadsheetId,
      target: target.target,
      allowProdWrites: target.allowProdWrites,
      writesAllowed: target.writesAllowed,
    },
  };
}
