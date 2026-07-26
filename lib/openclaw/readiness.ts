import { resolveOpenClawSecurityStoreConfig } from '@/lib/openclaw/security-store';
import type {
  OpenClawReadAvailability,
  OpenClawReadOperation,
  OpenClawReadiness,
  OpenClawSourceReadiness,
} from '@/types/openclaw';

function has(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function source(
  mode: string | undefined,
  liveMode: string,
  complete: boolean,
): OpenClawSourceReadiness {
  if (mode === 'mock') return 'mock';
  return mode === liveMode && complete ? 'ready' : 'unavailable';
}

function combine(values: readonly OpenClawSourceReadiness[]): OpenClawReadAvailability {
  if (values.every((value) => value === 'ready')) return 'ready';
  if (values.some((value) => value === 'ready' || value === 'mock')) return 'degraded';
  return 'unavailable';
}

export function getOpenClawReadiness(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawReadiness {
  const store = resolveOpenClawSecurityStoreConfig(env);
  const distributed =
    env.OPENCLAW_RATE_LIMIT_MODE === 'upstash' &&
    env.OPENCLAW_REPLAY_MODE === 'upstash' &&
    store.ok;
  const local =
    !env.VERCEL_ENV &&
    (env.NODE_ENV === 'test' ||
      (env.NODE_ENV !== 'production' &&
        env.OPENCLAW_RATE_LIMIT_MODE === 'memory' &&
        env.OPENCLAW_REPLAY_MODE === 'memory'));
  const securityControls = distributed || local ? 'ready' : 'blocked';

  const notion = source(
    env.NOTION_DATA_SOURCE,
    'notion',
    has(env.NOTION_API_TOKEN) &&
      has(env.NOTION_TASKS_DATA_SOURCE_ID) &&
      has(env.NOTION_PROJECTS_DATA_SOURCE_ID) &&
      has(env.NOTION_AREAS_DATA_SOURCE_ID),
  );
  const sheets = source(
    env.DATA_SOURCE,
    'google',
    has(env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
      has(env.GOOGLE_PRIVATE_KEY) &&
      has(
        env.GOOGLE_SHEETS_TARGET === 'prod' ? env.GOOGLE_SHEETS_PROD_ID : env.GOOGLE_SHEETS_DEV_ID,
      ),
  );
  const calendar = source(
    env.GOOGLE_CALENDAR_DATA_SOURCE,
    'google',
    has(env.GOOGLE_CALENDAR_CLIENT_ID) &&
      has(env.GOOGLE_CALENDAR_CLIENT_SECRET) &&
      has(env.GOOGLE_CALENDAR_REFRESH_TOKEN) &&
      has(env.GOOGLE_CALENDAR_IDS),
  );
  const catalog: OpenClawSourceReadiness =
    env.WEB_CATALOG_ENABLED === 'true' &&
    has(env.NOTION_WEB_CATALOG_DATA_SOURCE_ID) &&
    has(env.NOTION_WEB_CATALOG_API_TOKEN ?? env.NOTION_API_TOKEN)
      ? 'ready'
      : 'unavailable';

  const readers: Record<OpenClawReadOperation, OpenClawReadAvailability> = {
    'system.overview': combine([notion, sheets, calendar]),
    'areas.list': combine([notion]),
    'areas.get': combine([notion, calendar]),
    'tasks.list': combine([notion]),
    'projects.list': combine([notion]),
    'calendar.upcoming': combine([calendar]),
    'gym.summary': combine([notion, sheets, catalog]),
    'approvals.list': 'ready',
    'documents.search': combine([catalog]),
    'document.get': combine([catalog]),
  };

  const values = Object.values(readers);
  const status =
    securityControls === 'blocked'
      ? 'blocked'
      : values.every((value) => value === 'ready')
        ? 'ready'
        : 'degraded';

  return {
    status,
    securityControls,
    sources: { notion, sheets, calendar, catalog },
    readers,
  };
}
