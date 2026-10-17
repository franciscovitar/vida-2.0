import { getGoogleConfig, type GoogleConfigResult } from '@/lib/data/config';
import type { SheetsTargetName, SpreadsheetTargetEnv } from '@/lib/google/spreadsheet-target-core';

/**
 * No implicit DEV/PROD fallback for new V2 surfaces. The owner must explicitly
 * bind each V2 reader to an authorized source via its own server-only variable.
 */
export function resolveScopedSheetReadTarget(value: string | undefined): SheetsTargetName | null {
  return value === 'dev' || value === 'prod' ? value : null;
}

/**
 * Config for read-only requests: never mutates process.env or the shared target.
 * The existing resolver still refuses PROD when the environment is not allowed.
 */
export function getScopedGoogleReadConfig(
  env: SpreadsheetTargetEnv,
  readTarget?: SheetsTargetName,
): GoogleConfigResult {
  return getGoogleConfig(readTarget ? { ...env, GOOGLE_SHEETS_TARGET: readTarget } : env);
}
