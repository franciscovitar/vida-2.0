/** Private, bounded, opt-in, read-only Notion adapter for accepted Logros. */
import 'server-only';

import { Client } from '@notionhq/client';

import {
  buildAchievementsFromNotionQueries,
  MAX_ACHIEVEMENTS_QUERY_PAGES,
  type AchievementsView,
} from '@/lib/achievements/view';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import { getAchievementsReadConfig } from '@/lib/achievements/config';

/** Source is read only; no Notion writes, Journal crawling or inferred achievements. */
export async function getAchievementsView(): Promise<AchievementsView> {
  await requireAuthorizedSession();
  const config = getAchievementsReadConfig();
  if (!config) return { state: 'not-configured', items: [] };
  try {
    const client = new Client({ auth: config.token, notionVersion: '2025-09-03' });
    const responses: unknown[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_ACHIEVEMENTS_QUERY_PAGES; page++) {
      const response = await client.dataSources.query({
        data_source_id: config.dataSourceId,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      responses.push(response);
      if (!response.has_more) break;
      if (!response.next_cursor || response.next_cursor === cursor) {
        return { state: 'unavailable', items: [] };
      }
      cursor = response.next_cursor;
    }
    return buildAchievementsFromNotionQueries(responses, config.dataSourceId);
  } catch {
    return { state: 'unavailable', items: [] };
  }
}
