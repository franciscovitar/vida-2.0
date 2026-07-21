import { validateWebCatalog } from '@/lib/web-catalog/validator';
import type {
  WebCatalogEntry,
  WebCatalogIndexResult,
  WebCatalogResolution,
  WebCatalogRouteIndex,
} from '@/types/web-catalog';

/** Construye un índice solo cuando el catálogo completo es válido. */
export function buildWebCatalogIndex(entries: readonly WebCatalogEntry[]): WebCatalogIndexResult {
  const validation = validateWebCatalog(entries);
  if (!validation.valid) return { ok: false, validation };

  const routes: Record<string, WebCatalogResolution> = {};
  for (const entry of entries) {
    routes[entry.slug] = {
      stableKey: entry.stableKey,
      matchedBy: 'slug',
      matchedValue: entry.slug,
    };

    for (const alias of entry.aliases) {
      routes[alias] = {
        stableKey: entry.stableKey,
        matchedBy: 'alias',
        matchedValue: alias,
      };
    }
  }

  return { ok: true, index: { routes: Object.freeze(routes) } };
}

export function resolveWebCatalogPath(
  index: WebCatalogRouteIndex,
  path: string,
): WebCatalogResolution | null {
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');
  return index.routes[normalized] ?? null;
}
