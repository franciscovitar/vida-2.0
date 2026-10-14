export function isHabitsV2UiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.HABITS_V2_UI_ENABLED === 'true';
}

export function isHabitsV2WritesEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.HABITS_V2_WRITES_ENABLED === 'true';
}
