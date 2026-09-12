import { normalizePrivateKey } from '@/lib/data/config';

export type MediaSheetsEnv = Readonly<Record<string, string | undefined>>;

export interface MediaSheetsAuthConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

const MEDIA_SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

export function getMediaSpreadsheetId(env: MediaSheetsEnv = process.env): string | null {
  const value = env.GOOGLE_MEDIA_SPREADSHEET_ID?.trim();
  if (!value || !MEDIA_SPREADSHEET_ID_PATTERN.test(value)) return null;
  return value;
}

export function getMediaSheetsAuthConfig(
  env: MediaSheetsEnv = process.env,
): MediaSheetsAuthConfig | null {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = getMediaSpreadsheetId(env);

  if (!clientEmail || !rawPrivateKey?.trim() || !spreadsheetId) return null;

  return {
    clientEmail,
    privateKey: normalizePrivateKey(rawPrivateKey),
    spreadsheetId,
  };
}

export function isMediaSpreadsheetConfigured(env: MediaSheetsEnv = process.env): boolean {
  return getMediaSpreadsheetId(env) !== null;
}

/**
 * Compuerta independiente para la única escritura de Media soportada por la web:
 * `Lote manual` sobre un título `Por ver`. Ausente o cualquier otro valor => OFF.
 */
export function areMediaSheetWritesAllowed(env: MediaSheetsEnv = process.env): boolean {
  return env.GOOGLE_MEDIA_SHEETS_ALLOW_WRITES === 'true';
}
