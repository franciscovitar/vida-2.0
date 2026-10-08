/** Independent, fail-closed Phase E6 presentation gate. No writes. */
export function isProjectsV2SignalsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.PROJECTS_E6_SIGNALS_ENABLED === 'true';
}
