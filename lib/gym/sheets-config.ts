import { normalizePrivateKey } from '@/lib/data/config';

export type GymSheetsEnv = Readonly<Record<string, string | undefined>>;

export type GymSheetsAuthConfig = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
};

export type GymSheetsWriteConfigResult =
  | { ok: true; config: GymSheetsAuthConfig }
  | { ok: false; reason: 'not-configured' | 'writes-disabled' };

const GYM_SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

export function getGymSpreadsheetId(env: GymSheetsEnv = process.env): string | null {
  const value = env.GOOGLE_GYM_SPREADSHEET_ID?.trim();
  if (!value || !GYM_SPREADSHEET_ID_PATTERN.test(value)) return null;
  return value;
}

export function getGymSheetsAuthConfig(
  env: GymSheetsEnv = process.env,
): GymSheetsAuthConfig | null {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = getGymSpreadsheetId(env);

  if (!clientEmail || !rawPrivateKey?.trim() || !spreadsheetId) return null;

  return {
    clientEmail,
    privateKey: normalizePrivateKey(rawPrivateKey),
    spreadsheetId,
  };
}

/**
 * Escritura Gym usa siempre el spreadsheet dedicado y exige una compuerta
 * adicional. El valor puede diferir por entorno mediante variables server-side;
 * nunca reutiliza implícitamente el target general de hábitos.
 */
export function getGymSheetsWriteConfig(
  env: GymSheetsEnv = process.env,
): GymSheetsWriteConfigResult {
  const config = getGymSheetsAuthConfig(env);
  if (!config) return { ok: false, reason: 'not-configured' };
  if (env.GOOGLE_GYM_SHEETS_ALLOW_WRITES !== 'true') {
    return { ok: false, reason: 'writes-disabled' };
  }
  return { ok: true, config };
}
