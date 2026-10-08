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
