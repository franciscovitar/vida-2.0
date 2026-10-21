/** Fail-closed server configuration, pure for deterministic tests. */
type Env = Readonly<Record<string, string | undefined>>;
const ID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function isAchievementsReadEnabled(env: Env = process.env): boolean {
  return env.ACHIEVEMENTS_V1_READ_ENABLED === 'true';
}

export function getAchievementsReadConfig(
  env: Env = process.env,
): { token: string; dataSourceId: string } | null {
  if (!isAchievementsReadEnabled(env)) return null;
  const token = env.NOTION_API_TOKEN?.trim();
  const dataSourceId = env.NOTION_ACHIEVEMENTS_DATA_SOURCE_ID?.trim();
  if (!token || !dataSourceId || !ID.test(dataSourceId)) return null;
  const otherIds = [
    env.NOTION_TASKS_DATA_SOURCE_ID,
    env.NOTION_PROJECTS_DATA_SOURCE_ID,
    env.NOTION_AREAS_DATA_SOURCE_ID,
    env.NOTION_MILESTONES_DATA_SOURCE_ID,
  ];
  if (otherIds.some((id) => id?.trim().toLowerCase() === dataSourceId.toLowerCase())) return null;
  return { token, dataSourceId };
}
