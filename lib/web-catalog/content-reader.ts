/**
 * Lector recursivo acotado de bloques Notion → ContentPage.
 * Solo se invoca tras pasar la política del catálogo.
 */
import { WEB_CATALOG_READ_LIMITS } from '@/lib/web-catalog/constants';
import { adaptCatalogBlock } from '@/lib/web-catalog/content-adapters';
import { parseNotionSourceRef } from '@/lib/web-catalog/catalog-mapper';
import type { WebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import type { ContentBlock, ContentPage, PublicContentPolicy } from '@/types/content';
import type { WebCatalogEntry, WebCatalogRouteIndex } from '@/types/web-catalog';
import type { NotionReadCode } from '@/lib/notion/errors';

export type ContentReadResult =
  { ok: true; page: ContentPage } | { ok: false; code: NotionReadCode | 'invalid-source' };

function publicPolicy(entry: WebCatalogEntry): PublicContentPolicy {
  return {
    visibleWeb: entry.policy.visibleWeb,
    searchable: entry.policy.searchable,
    generalAI: entry.policy.generalAI,
    reviewAI: entry.policy.reviewAI,
  };
}

function resolveChildSlug(title: string | null, index: WebCatalogRouteIndex): string | null {
  if (!title) return null;
  const normalized = title.trim().toLowerCase().replace(/\s+/g, '-');
  const hit = index.routes[normalized];
  if (!hit) return null;
  const canonical = Object.values(index.routes).find(
    (route) => route.stableKey === hit.stableKey && route.matchedBy === 'slug',
  );
  return canonical?.matchedValue ?? null;
}

async function readBlocksRecursive(
  port: WebCatalogNotionPort,
  blockId: string,
  depth: number,
  state: { count: number; visited: Set<string> },
  index: WebCatalogRouteIndex,
): Promise<{ ok: true; blocks: ContentBlock[] } | { ok: false; code: NotionReadCode }> {
  if (depth > WEB_CATALOG_READ_LIMITS.maxDepth) return { ok: true, blocks: [] };
  if (state.visited.has(blockId)) return { ok: true, blocks: [] };
  state.visited.add(blockId);

  const listed = await port.listBlockChildren(blockId);
  if (!listed.ok) return listed;

  const out: ContentBlock[] = [];
  for (let i = 0; i < listed.blocks.length; i += 1) {
    if (state.count >= WEB_CATALOG_READ_LIMITS.maxBlocks) break;
    const raw = listed.blocks[i];
    state.count += 1;

    let children: ContentBlock[] = [];
    if (raw.has_children && depth < WEB_CATALOG_READ_LIMITS.maxDepth) {
      const childResult = await readBlocksRecursive(port, raw.id, depth + 1, state, index);
      if (!childResult.ok) return childResult;
      children = childResult.blocks;
    }

    const payload = raw.raw[raw.type];
    const title =
      payload && typeof payload === 'object' && 'title' in payload
        ? typeof (payload as { title?: unknown }).title === 'string'
          ? (payload as { title: string }).title
          : null
        : null;
    const childSlug = raw.type === 'child_page' ? resolveChildSlug(title, index) : null;
    // Solo enlazar child pages autorizadas por el índice del catálogo.
    out.push(adaptCatalogBlock(raw, i, children, childSlug));
  }

  return { ok: true, blocks: out };
}

export async function readWebCatalogContentPage(
  port: WebCatalogNotionPort,
  entry: WebCatalogEntry,
  index: WebCatalogRouteIndex,
): Promise<ContentReadResult> {
  const pageId = parseNotionSourceRef(entry.sourceRef);
  if (!pageId) return { ok: false, code: 'invalid-source' };

  const meta = await port.retrievePageMeta(pageId);
  if (!meta.ok) return meta;

  const state = { count: 0, visited: new Set<string>() };
  const blocksResult = await readBlocksRecursive(port, pageId, 0, state, index);
  if (!blocksResult.ok) return blocksResult;

  const childPages = blocksResult.blocks
    .filter((block) => block.type === 'child_page' && block.childPageSlug)
    .map((block) => ({
      slug: block.childPageSlug as string,
      title: block.childPageTitle ?? 'Página',
    }));

  const page: ContentPage = {
    stableKey: entry.stableKey,
    slug: entry.slug,
    title: meta.title ?? entry.editorialName,
    icon: meta.icon,
    lastEditedAt: meta.lastEditedAt,
    renderMode: entry.renderMode,
    policy: publicPolicy(entry),
    blocks: blocksResult.blocks,
    childPages,
    provenance: {
      source: 'web-catalog',
      fetchedAt: new Date().toISOString(),
    },
  };

  return { ok: true, page };
}
