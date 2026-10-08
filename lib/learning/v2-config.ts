/**
 * Staged Learning Hub V2 surface gate.
 * Fail-closed so Production keeps the current Aprendizaje route until explicitly enabled.
 */
export function isLearningHubV2Enabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.LEARNING_HUB_V2_UI_ENABLED === 'true';
}
