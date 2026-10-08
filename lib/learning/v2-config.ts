/**
 * Fail-closed gate for the staged Aprendizaje V2 landing.
 * Production keeps the current documentary landing unless explicitly enabled.
 */
export function isLearningHubV2UiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.LEARNING_HUB_V2_UI_ENABLED === 'true';
}
