/**
 * Segunda barrera documental por perfil de agente.
 * Se aplica después de la política generalAI del Registro Web.
 */
import 'server-only';

import { isOpenClawDocumentEntryAllowed } from '@/lib/openclaw/agents';
import { resolveWebCatalogPath } from '@/lib/web-catalog/index';
import { loadValidatedWebCatalog } from '@/lib/web-catalog/notion-repository';
import type { WebCatalogSearchHit } from '@/lib/web-catalog/search';
import type { OpenClawAgentId } from '@/types/openclaw';

function slugFromHref(href: string): string | null {
  if (!href.startsWith('/') || href.includes('://')) return null;
  const segments = href.split('/').filter(Boolean);
  const slug = segments.at(-1)?.trim() ?? '';
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

export async function authorizeOpenClawDocumentSlug(
  agentId: OpenClawAgentId,
  slug: string,
): Promise<boolean> {
  const catalog = await loadValidatedWebCatalog();
  if (!catalog.ok) return false;

  const resolution = resolveWebCatalogPath(catalog.index, slug);
  if (!resolution) return false;

  const entry = catalog.entries.find((item) => item.stableKey === resolution.stableKey);
  return entry ? isOpenClawDocumentEntryAllowed(agentId, entry) : false;
}

export async function filterOpenClawDocumentHits(
  agentId: OpenClawAgentId,
  hits: readonly WebCatalogSearchHit[],
): Promise<WebCatalogSearchHit[]> {
  const catalog = await loadValidatedWebCatalog();
  if (!catalog.ok) return [];

  return hits.filter((hit) => {
    const slug = slugFromHref(hit.href);
    if (!slug) return false;
    const resolution = resolveWebCatalogPath(catalog.index, slug);
    if (!resolution) return false;
    const entry = catalog.entries.find((item) => item.stableKey === resolution.stableKey);
    return entry ? isOpenClawDocumentEntryAllowed(agentId, entry) : false;
  });
}
