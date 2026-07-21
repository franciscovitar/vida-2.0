/**
 * Repositorio real del Registro Web (solo lectura).
 */
import 'server-only';

import { loadValidatedWebCatalogWithPort } from '@/lib/web-catalog/catalog-load';
import { mapCatalogRawPages } from '@/lib/web-catalog/catalog-mapper';
import { getWebCatalogNotionConfig } from '@/lib/web-catalog/config';
import type { WebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import { createWebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import type { WebCatalogRepository } from '@/lib/web-catalog/repository';
import type { WebCatalogEntry } from '@/types/web-catalog';

export type { WebCatalogLoadResult } from '@/lib/web-catalog/catalog-load';

export function createNotionWebCatalogRepository(
  port: WebCatalogNotionPort,
  dataSourceId: string,
): WebCatalogRepository {
  let cache: readonly WebCatalogEntry[] | null = null;

  async function loadEntries(): Promise<readonly WebCatalogEntry[]> {
    if (cache) return cache;
    const result = await port.queryCatalogDataSource(dataSourceId);
    if (!result.ok) {
      cache = [];
      return cache;
    }
    cache = mapCatalogRawPages(result.pages);
    return cache;
  }

  return {
    async list(): Promise<readonly WebCatalogEntry[]> {
      return loadEntries();
    },
    async getByStableKey(stableKey: string): Promise<WebCatalogEntry | null> {
      const entries = await loadEntries();
      return entries.find((entry) => entry.stableKey === stableKey) ?? null;
    },
  };
}

/** Carga, valida e indexa el catálogo con el puerto real o uno inyectado. */
export async function loadValidatedWebCatalog(
  port?: WebCatalogNotionPort,
): Promise<import('@/lib/web-catalog/catalog-load').WebCatalogLoadResult> {
  const config = getWebCatalogNotionConfig();
  if (!config.ok) return { ok: false, code: 'not-configured' };

  const notionPort = port ?? createWebCatalogNotionPort(config.token);
  return loadValidatedWebCatalogWithPort(notionPort, config.dataSourceId);
}
