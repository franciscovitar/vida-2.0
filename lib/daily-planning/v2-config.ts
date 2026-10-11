import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';

/**
 * Surface gates for the staged Daily Planning V2 UI.
 * Server-side and fail-closed: Production keeps the certified V1 surfaces unless explicitly enabled.
 */
export function isDailyPlanningV2UiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.DAILY_PLANNING_V2_UI_ENABLED === 'true';
}

export function isTodayCockpitV2UiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.TODAY_COCKPIT_V2_UI_ENABLED === 'true';
}

export function isTaskDateSemanticsV2Enabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.TASK_DATE_SEMANTICS_V2_ENABLED === 'true';
}

/** Independent read-only history gate. Default false even when V2 UI is enabled. */
export function isPlanningExecutionV2ReadsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.PLANNING_EXECUTION_V2_READS_ENABLED === 'true';
}

/**
 * V2 execution history is not ready for a production source rollout.
 * A UI flag or a mistaken Production environment variable alone must not
 * permit a read from Production's private historical workbook.
 */
export function isPlanningExecutionV2DevReadEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (
    !isPlanningExecutionV2ReadsEnabled(env) ||
    env.GOOGLE_SHEETS_TARGET !== 'dev' ||
    env.DATA_SOURCE !== 'google' ||
    (env.VERCEL_ENV !== 'preview' && env.VERCEL_ENV !== 'development')
  )
    return false;
  const target = resolveSpreadsheetTarget(env);
  const prodId = env.GOOGLE_SHEETS_PROD_ID?.trim();
  return target.ok && target.target === 'dev' && !!prodId && prodId !== target.spreadsheetId;
}
