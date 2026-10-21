/** Private, bounded, opt-in, read-only Notion adapter for accepted Logros. */
import 'server-only';

import { Client } from '@notionhq/client';

import { buildAchievementsFromNotionQuery, type AchievementsView } from '@/lib/achievements/view';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import { getAchievementsReadConfig } from '@/lib/achievements/config';

/** Source is read only; no Notion writes, Journal crawling or inferred achievements. */
export async function getAchievementsView(): Promise<AchievementsView> {
  await requireAuthorizedSession();
  const config = getAchievementsReadConfig();
  if (!config) return { state: 'not-configured', items: [] };
  try {
    const client = new Client({ auth: config.token, notionVersion: '2025-09-03' });
    const response = await client.dataSources.query({
      data_source_id: config.dataSourceId,
      page_size: 100,
    });
    return buildAchievementsFromNotionQuery(response, config.dataSourceId);
  } catch {
    return { state: 'unavailable', items: [] };
  }
}
