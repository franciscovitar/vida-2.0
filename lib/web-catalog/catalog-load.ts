/**
 * Carga/validación/indexación del catálogo (testeable, sin server-only).
 */
import { mapCatalogRawPages } from '@/lib/web-catalog/catalog-mapper';
import { buildWebCatalogIndex } from '@/lib/web-catalog/index';
import type { WebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import { validateWebCatalog } from '@/lib/web-catalog/validator';
import type { WebCatalogEntry, WebCatalogIndexResult } from '@/types/web-catalog';
import type { NotionReadCode } from '@/lib/notion/errors';

export type WebCatalogLoadResult =
  | {
      ok: true;
      entries: readonly WebCatalogEntry[];
      index: Extract<WebCatalogIndexResult, { ok: true }>['index'];
    }
  | { ok: false; code: NotionReadCode | 'invalid-catalog' | 'not-configured' };

export async function loadValidatedWebCatalogWithPort(
  port: WebCatalogNotionPort,
  dataSourceId: string,
): Promise<WebCatalogLoadResult> {
  const query = await port.queryCatalogDataSource(dataSourceId);
  if (!query.ok) return { ok: false, code: query.code };

  const entries = mapCatalogRawPages(query.pages);
  const validation = validateWebCatalog(entries);
  if (!validation.valid) return { ok: false, code: 'invalid-catalog' };

  const indexResult = buildWebCatalogIndex(entries);
  if (!indexResult.ok) return { ok: false, code: 'invalid-catalog' };

  return { ok: true, entries, index: indexResult.index };
}
