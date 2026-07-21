/**
 * Puerto Notion de solo lectura para el Registro Web.
 * Consulta un data source autorizado por entorno + páginas/bloques.
 */
import 'server-only';

import { Client } from '@notionhq/client';

import { isAllowedWebCatalogDataSourceId } from '@/lib/web-catalog/config';
import type { CatalogRawPage } from '@/lib/web-catalog/catalog-mapper';
import { mapNotionFailure, type NotionReadCode } from '@/lib/notion/errors';

export type WebCatalogQueryResult =
  { ok: true; pages: CatalogRawPage[] } | { ok: false; code: NotionReadCode };

export type WebCatalogPageMetaResult =
  | {
      ok: true;
      title: string | null;
      icon: string | null;
      lastEditedAt: string | null;
    }
  | { ok: false; code: NotionReadCode };

export type WebCatalogBlocksResult =
  { ok: true; blocks: readonly CatalogRawBlock[] } | { ok: false; code: NotionReadCode };

/** Bloque crudo mínimo (sin tipar el SDK completo). */
export type CatalogRawBlock = {
  id: string;
  type: string;
  has_children: boolean;
  raw: Record<string, unknown>;
};

export interface WebCatalogNotionPort {
  queryCatalogDataSource(dataSourceId: string): Promise<WebCatalogQueryResult>;
  retrievePageMeta(pageId: string): Promise<WebCatalogPageMetaResult>;
  listBlockChildren(blockId: string): Promise<WebCatalogBlocksResult>;
}

function createSdkClient(token: string): Client {
  return new Client({ auth: token, notionVersion: '2025-09-03' });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * Puerto real: query del catálogo + retrieve page + blocks.children.list.
 * Sin create/update/delete/search global.
 */
export function createWebCatalogNotionPort(token: string): WebCatalogNotionPort {
  const client = createSdkClient(token);

  return {
    async queryCatalogDataSource(dataSourceId: string): Promise<WebCatalogQueryResult> {
      if (!isAllowedWebCatalogDataSourceId(dataSourceId)) {
        return { ok: false, code: 'forbidden-data-source' };
      }

      try {
        const pages: CatalogRawPage[] = [];
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

    async retrievePageMeta(pageId: string): Promise<WebCatalogPageMetaResult> {
      try {
        const page = await client.pages.retrieve({ page_id: pageId });
        const record = asRecord(page);
        if (!record || record.object !== 'page') {
          return { ok: false, code: 'missing-data-source' };
        }

        const iconObj = asRecord(record.icon);
        let icon: string | null = null;
        if (iconObj?.type === 'emoji' && typeof iconObj.emoji === 'string') {
          icon = iconObj.emoji;
        }

        const lastEditedAt =
          typeof record.last_edited_time === 'string' ? record.last_edited_time : null;

        const properties = asRecord(record.properties) ?? {};
        let title: string | null = null;
        for (const value of Object.values(properties)) {
          const prop = asRecord(value);
          if (prop?.type === 'title' && Array.isArray(prop.title)) {
            title =
              prop.title
                .map((part) => {
                  const p = asRecord(part);
                  return typeof p?.plain_text === 'string' ? p.plain_text : '';
                })
                .join('')
                .trim() || null;
            break;
          }
        }

        return { ok: true, title, icon, lastEditedAt };
      } catch (error) {
        return { ok: false, code: mapNotionFailure(error) };
      }
    },

    async listBlockChildren(blockId: string): Promise<WebCatalogBlocksResult> {
      try {
        const blocks: CatalogRawBlock[] = [];
        let cursor: string | undefined;
        do {
          const response = await client.blocks.children.list({
            block_id: blockId,
            start_cursor: cursor,
            page_size: 100,
          });
          for (const item of response.results) {
            const record = asRecord(item);
            if (!record || typeof record.id !== 'string' || typeof record.type !== 'string') {
              continue;
            }
            blocks.push({
              id: record.id,
              type: record.type,
              has_children: record.has_children === true,
              raw: record,
            });
          }
          cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
        } while (cursor);

        return { ok: true, blocks };
      } catch (error) {
        return { ok: false, code: mapNotionFailure(error) };
      }
    },
  };
}
