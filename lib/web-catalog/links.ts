/**
 * Resolución segura de hrefs de contenido (Notion internos → rutas web).
 */
import { extractNotionPageIdFromUrl, parseNotionSourceRef } from '@/lib/web-catalog/catalog-mapper';
import { NOTION_SOURCE_REF_HOSTS } from '@/lib/web-catalog/constants';
import { canLoadWebCatalogContent, usesGenericDocumentRenderer } from '@/lib/web-catalog/policy';
import type { WebCatalogEntry } from '@/types/web-catalog';

export type ResolvedHref =
  | { kind: 'internal'; href: string }
  | { kind: 'external'; href: string }
  | { kind: 'unavailable' }
  | { kind: 'none' };

/** Índice página Notion → entrada del catálogo (solo servidor). */
export type SourcePageIndex = ReadonlyMap<string, WebCatalogEntry>;

export function buildSourcePageIndex(
  entries: readonly WebCatalogEntry[],
): Map<string, WebCatalogEntry> {
  const map = new Map<string, WebCatalogEntry>();
  for (const entry of entries) {
    const pageId = parseNotionSourceRef(entry.sourceRef);
    if (pageId) map.set(pageId.toLowerCase(), entry);
  }
  return map;
}

function isNotionHost(hostname: string): boolean {
  return NOTION_SOURCE_REF_HOSTS.has(hostname.toLowerCase());
}

/** HTTPS externo seguro: sin credenciales, sin puerto no estándar. */
export function isSafeExternalHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username !== '' || parsed.password !== '') return false;
    if (parsed.port !== '') return false;
    if (isNotionHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve un href crudo hacia ruta interna, externo seguro o no disponible.
 * Nunca devuelve URLs de Notion ni IDs.
 */
export function resolveContentHref(
  rawUrl: string | null | undefined,
  sourceIndex: SourcePageIndex,
): ResolvedHref {
  if (!rawUrl || typeof rawUrl !== 'string') return { kind: 'none' };
  const trimmed = rawUrl.trim();
  if (trimmed === '') return { kind: 'none' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { kind: 'none' };
  }

  if (isNotionHost(parsed.hostname)) {
    const pageId = extractNotionPageIdFromUrl(trimmed);
    if (!pageId) return { kind: 'unavailable' };
    const entry = sourceIndex.get(pageId.toLowerCase());
    if (entry && canLoadWebCatalogContent(entry) && usesGenericDocumentRenderer(entry)) {
      return { kind: 'internal', href: `/p/${entry.slug}` };
    }
    return { kind: 'unavailable' };
  }

  if (isSafeExternalHttpsUrl(trimmed)) {
    return { kind: 'external', href: trimmed };
  }

  return { kind: 'none' };
}

export function resolvedHrefToTextFields(resolved: ResolvedHref): {
  href: string | null;
  unavailable: boolean;
  external: boolean;
} {
  if (resolved.kind === 'internal') {
    return { href: resolved.href, unavailable: false, external: false };
  }
  if (resolved.kind === 'external') {
    return { href: resolved.href, unavailable: false, external: true };
  }
  if (resolved.kind === 'unavailable') {
    return { href: null, unavailable: true, external: false };
  }
  return { href: null, unavailable: false, external: false };
}
