/**
 * Orquestación del Registro Web: resolución, política, navegación y búsqueda.
 */
import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';

import type { NavItemData } from '@/lib/constants/navigation';
import { WEB_CATALOG_READ_LIMITS } from '@/lib/web-catalog/constants';
import { getWebCatalogNotionConfig, isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { readWebCatalogContentPage } from '@/lib/web-catalog/content-reader';
import { webCatalogNoticeFor, type WebCatalogServiceCode } from '@/lib/web-catalog/errors';
import { resolveWebCatalogPath } from '@/lib/web-catalog/index';
import { buildAppNavigation } from '@/lib/web-catalog/navigation';
import { createWebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import { loadValidatedWebCatalog } from '@/lib/web-catalog/notion-repository';
import {
  canLoadWebCatalogContent,
  canSearchWebCatalogEntry,
  isPrivateWebCatalogEntry,
  usesGenericDocumentRenderer,
} from '@/lib/web-catalog/policy';
import {
  buildSearchableDocument,
  searchWebCatalogDocuments,
  type SearchableDocument,
  type WebCatalogSearchHit,
} from '@/lib/web-catalog/search';
import { WEB_CATALOG_SEARCH_LIMITS } from '@/lib/web-catalog/section-labels';
import type { ContentPage } from '@/types/content';
import type { WebCatalogEntry } from '@/types/web-catalog';

export type WebCatalogPageServiceResult =
  | { ok: true; kind: 'document'; page: ContentPage }
  | { ok: true; kind: 'redirect'; slug: string }
  | {
      ok: true;
      kind: 'unimplemented-renderer';
      entry: Pick<WebCatalogEntry, 'stableKey' | 'slug' | 'editorialName' | 'renderMode'>;
      message: string;
    }
  | { ok: false; code: WebCatalogServiceCode; message: string };

const loadCatalogCached = unstable_cache(
  async () => loadValidatedWebCatalog(),
  ['web-catalog-validated'],
  { revalidate: WEB_CATALOG_READ_LIMITS.revalidateSeconds },
);

async function loadCatalogForRequest() {
  return loadCatalogCached();
}

function mapCatalogFailure(code: string): {
  ok: false;
  code: WebCatalogServiceCode;
  message: string;
} {
  const mapped: WebCatalogServiceCode =
    code === 'invalid-catalog'
      ? 'invalid-catalog'
      : code === 'not-configured'
        ? 'not-configured'
        : code === 'auth-error'
          ? 'auth-error'
          : code === 'permission-error'
            ? 'permission-error'
            : code === 'rate-limited'
              ? 'rate-limited'
              : code === 'network-error'
                ? 'network-error'
                : 'read-error';
  return { ok: false, code: mapped, message: webCatalogNoticeFor(mapped) };
}

async function loadDocumentForEntry(
  entry: WebCatalogEntry,
  catalogEntries: readonly WebCatalogEntry[],
  index: Parameters<typeof readWebCatalogContentPage>[2],
): Promise<WebCatalogPageServiceResult> {
  if (isPrivateWebCatalogEntry(entry) || !canLoadWebCatalogContent(entry)) {
    return {
      ok: false,
      code: 'forbidden-policy',
      message: webCatalogNoticeFor('forbidden-policy'),
    };
  }

  if (!usesGenericDocumentRenderer(entry)) {
    return {
      ok: true,
      kind: 'unimplemented-renderer',
      entry: {
        stableKey: entry.stableKey,
        slug: entry.slug,
        editorialName: entry.editorialName,
        renderMode: entry.renderMode,
      },
      message: webCatalogNoticeFor('renderer-unimplemented'),
    };
  }

  const config = getWebCatalogNotionConfig();
  if (!config.ok) {
    return {
      ok: false,
      code: 'not-configured',
      message: webCatalogNoticeFor('not-configured'),
    };
  }

  const port = createWebCatalogNotionPort(config.token);
  const content = await readWebCatalogContentPage(port, entry, index, catalogEntries);
  if (!content.ok) {
    return mapCatalogFailure(content.code);
  }

  return { ok: true, kind: 'document', page: content.page };
}

/**
 * Resuelve un slug/alias y, si corresponde, lee el contenido documental.
 * Nunca lee privados/legacy/ocultos. No cachea contenido privado (no se lee).
 */
export const resolveWebCatalogPage = cache(
  async (rawSlug: string): Promise<WebCatalogPageServiceResult> => {
    if (!isWebCatalogEnabled()) {
      return {
        ok: false,
        code: 'flag-disabled',
        message: webCatalogNoticeFor('flag-disabled'),
      };
    }

    const config = getWebCatalogNotionConfig();
    if (!config.ok) {
      return {
        ok: false,
        code: 'not-configured',
        message: webCatalogNoticeFor('not-configured'),
      };
    }

    const catalog = await loadCatalogForRequest();
    if (!catalog.ok) return mapCatalogFailure(catalog.code);

    const resolution = resolveWebCatalogPath(catalog.index, rawSlug);
    if (!resolution) {
      return { ok: false, code: 'not-found', message: webCatalogNoticeFor('not-found') };
    }

    const entry = catalog.entries.find((item) => item.stableKey === resolution.stableKey);
    if (!entry) {
      return { ok: false, code: 'not-found', message: webCatalogNoticeFor('not-found') };
    }

    if (resolution.matchedBy === 'alias' && resolution.matchedValue !== entry.slug) {
      return { ok: true, kind: 'redirect', slug: entry.slug };
    }

    return loadDocumentForEntry(entry, catalog.entries, catalog.index);
  },
);

/** Resuelve una ruta fija documental por clave estable. */
export const resolveWebCatalogPageByStableKey = cache(
  async (stableKey: string): Promise<WebCatalogPageServiceResult> => {
    if (!isWebCatalogEnabled()) {
      return {
        ok: false,
        code: 'flag-disabled',
        message: webCatalogNoticeFor('flag-disabled'),
      };
    }

    const config = getWebCatalogNotionConfig();
    if (!config.ok) {
      return {
        ok: false,
        code: 'not-configured',
        message: webCatalogNoticeFor('not-configured'),
      };
    }

    const catalog = await loadCatalogForRequest();
    if (!catalog.ok) return mapCatalogFailure(catalog.code);

    const entry = catalog.entries.find((item) => item.stableKey === stableKey);
    if (!entry) {
      return { ok: false, code: 'not-found', message: webCatalogNoticeFor('not-found') };
    }

    return loadDocumentForEntry(entry, catalog.entries, catalog.index);
  },
);

/** Navegación desktop/mobile: misma fuente. */
export const getAppNavigation = cache(
  async (): Promise<{ primary: NavItemData[]; secondary: NavItemData[] }> => {
    const enabled = isWebCatalogEnabled();
    if (!enabled) return buildAppNavigation(false, []);

    const catalog = await loadCatalogForRequest();
    if (!catalog.ok) return buildAppNavigation(true, []);
    return buildAppNavigation(true, catalog.entries);
  },
);

const loadSearchIndexCached = unstable_cache(
  async (): Promise<SearchableDocument[]> => {
    if (!isWebCatalogEnabled()) return [];
    const config = getWebCatalogNotionConfig();
    if (!config.ok) return [];
    const catalog = await loadValidatedWebCatalog();
    if (!catalog.ok) return [];

    const port = createWebCatalogNotionPort(config.token);
    const documents: SearchableDocument[] = [];

    for (const entry of catalog.entries) {
      if (!canSearchWebCatalogEntry(entry)) continue;
      if (!usesGenericDocumentRenderer(entry)) continue;
      const content = await readWebCatalogContentPage(port, entry, catalog.index, catalog.entries);
      if (!content.ok) continue;
      const doc = buildSearchableDocument(entry, content.page);
      if (doc) documents.push(doc);
    }

    return documents;
  },
  ['web-catalog-search-index'],
  { revalidate: WEB_CATALOG_SEARCH_LIMITS.revalidateSeconds },
);

export const searchWebCatalog = cache(
  async (
    query: string,
  ): Promise<
    | { ok: true; hits: WebCatalogSearchHit[] }
    | { ok: false; code: WebCatalogServiceCode; message: string }
  > => {
    if (!isWebCatalogEnabled()) {
      return {
        ok: false,
        code: 'flag-disabled',
        message: webCatalogNoticeFor('flag-disabled'),
      };
    }

    const trimmed = query.trim();
    if (trimmed === '') return { ok: true, hits: [] };

    const documents = await loadSearchIndexCached();
    return { ok: true, hits: searchWebCatalogDocuments(documents, trimmed) };
  },
);
