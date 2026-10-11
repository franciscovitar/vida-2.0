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
