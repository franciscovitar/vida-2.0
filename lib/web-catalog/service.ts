/**
 * Orquestación del Registro Web: resolución, política y lectura.
 */
import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';

import { WEB_CATALOG_READ_LIMITS } from '@/lib/web-catalog/constants';
import { getWebCatalogNotionConfig, isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { readWebCatalogContentPage } from '@/lib/web-catalog/content-reader';
import { webCatalogNoticeFor, type WebCatalogServiceCode } from '@/lib/web-catalog/errors';
import { resolveWebCatalogPath } from '@/lib/web-catalog/index';
import { createWebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import { loadValidatedWebCatalog } from '@/lib/web-catalog/notion-repository';
import {
  canLoadWebCatalogContent,
  isPrivateWebCatalogEntry,
  usesGenericDocumentRenderer,
} from '@/lib/web-catalog/policy';
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
    if (!catalog.ok) {
      const code: WebCatalogServiceCode =
        catalog.code === 'invalid-catalog'
          ? 'invalid-catalog'
          : catalog.code === 'not-configured'
            ? 'not-configured'
            : catalog.code === 'auth-error'
              ? 'auth-error'
              : catalog.code === 'permission-error'
                ? 'permission-error'
                : catalog.code === 'rate-limited'
                  ? 'rate-limited'
                  : catalog.code === 'network-error'
                    ? 'network-error'
                    : 'read-error';
      return { ok: false, code, message: webCatalogNoticeFor(code) };
    }

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

    // Política antes de cualquier lectura de bloques/páginas.
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

    const port = createWebCatalogNotionPort(config.token);
    const content = await readWebCatalogContentPage(port, entry, catalog.index);
    if (!content.ok) {
      const code: WebCatalogServiceCode =
        content.code === 'auth-error'
          ? 'auth-error'
          : content.code === 'permission-error'
            ? 'permission-error'
            : content.code === 'rate-limited'
              ? 'rate-limited'
              : content.code === 'network-error'
                ? 'network-error'
                : 'read-error';
      return { ok: false, code, message: webCatalogNoticeFor(code) };
    }

    return { ok: true, kind: 'document', page: content.page };
  },
);
