import { normalizePrivateKey } from '@/lib/data/config';

export interface HouseholdReplenishmentSheetsEnv {
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  HOUSEHOLD_REPLENISHMENT_SHEET_ID?: string;
}

export interface HouseholdReplenishmentSheetsConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

export function getHouseholdReplenishmentSheetsConfig(
  env: HouseholdReplenishmentSheetsEnv = process.env,
): HouseholdReplenishmentSheetsConfig | null {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = env.HOUSEHOLD_REPLENISHMENT_SHEET_ID?.trim();

  if (!clientEmail || !rawPrivateKey?.trim() || !spreadsheetId) {
    return null;
  }

  return {
    clientEmail,
    privateKey: normalizePrivateKey(rawPrivateKey),
    spreadsheetId,
  };
}
