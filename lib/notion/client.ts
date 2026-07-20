import 'server-only';

import { Client } from '@notionhq/client';

import type { NotionRawPage } from '@/lib/notion/adapters';
import { isAllowedNotionDataSourceId } from '@/lib/notion/config';
import { mapNotionFailure, type NotionReadCode } from '@/lib/notion/errors';

export type { NotionRawPage };

export type NotionQueryPortResult =
  { ok: true; pages: NotionRawPage[] } | { ok: false; code: NotionReadCode };

export interface NotionReadPort {
  queryDataSource(dataSourceId: string): Promise<NotionQueryPortResult>;
}

function createSdkClient(token: string): Client {
  return new Client({ auth: token, notionVersion: '2025-09-03' });
}

/**
 * Puerto real: solo `dataSources.query` sobre IDs autorizados.
 * Sin operaciones de escritura ni búsqueda global.
 */
export function createNotionReadPort(token: string): NotionReadPort {
  const client = createSdkClient(token);

  return {
    async queryDataSource(dataSourceId: string): Promise<NotionQueryPortResult> {
      if (!isAllowedNotionDataSourceId(dataSourceId)) {
        return { ok: false, code: 'forbidden-data-source' };
      }

      try {
        const pages: NotionRawPage[] = [];
        let cursor: string | undefined;
        do {
          const response = await client.dataSources.query({
            data_source_id: dataSourceId,
            start_cursor: cursor,
            page_size: 100,
          });
          for (const item of response.results) {
            if (!('properties' in item) || !item.properties) continue;
            pages.push({
              id: item.id,
              properties: item.properties as Record<string, unknown>,
            });
          }
          cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
        } while (cursor);

        return { ok: true, pages };
      } catch (error) {
        return { ok: false, code: mapNotionFailure(error) };
      }
    },
  };
}
