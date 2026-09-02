import { normalizePrivateKey } from '@/lib/data/config';

export type NutritionSheetsEnv = Readonly<Record<string, string | undefined>>;

export type NutritionSheetsConfig = {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
};

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

export function getNutritionSpreadsheetId(
  env: NutritionSheetsEnv = process.env,
): string | null {
  const value = env.GOOGLE_NUTRITION_SPREADSHEET_ID?.trim();
  if (!value || !SPREADSHEET_ID_PATTERN.test(value)) return null;
  return value;
}

/**
 * Configuración read-only del store de Nutrition Intelligence.
 * Nunca reutiliza GOOGLE_SHEETS_DEV_ID / PROD_ID ni el target de Gimnasio.
 */
export function getNutritionSheetsConfig(
  env: NutritionSheetsEnv = process.env,
): NutritionSheetsConfig | null {
  const spreadsheetId = getNutritionSpreadsheetId(env);
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !rawPrivateKey?.trim()) return null;

  return {
    spreadsheetId,
    clientEmail,
    privateKey: normalizePrivateKey(rawPrivateKey),
  };
}
