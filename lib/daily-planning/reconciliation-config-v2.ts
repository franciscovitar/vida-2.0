/**
 * Separate read-only authorization gate for V2 write reconciliation.
 * Explicit OFF by default. This is a PRECONDITION, not user consent.
 */
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';

export function isPlanningV2DevReadbackEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (
    env.PLANNING_V2_DEV_RECONCILIATION_READS_ENABLED !== 'true' ||
    env.VERCEL_ENV === 'production' ||
    env.GOOGLE_SHEETS_TARGET !== 'dev'
  ) return false;
  const target = resolveSpreadsheetTarget(env);
  if (!target.ok || target.target !== 'dev') return false;
  const prodId = env.GOOGLE_SHEETS_PROD_ID?.trim();
  return !prodId || prodId !== target.spreadsheetId;
}
