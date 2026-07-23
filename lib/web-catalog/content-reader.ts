/**
 * Lector recursivo acotado de bloques Notion → ContentPage.
 * Solo se invoca tras pasar la política del catálogo.
 */
import { WEB_CATALOG_READ_LIMITS } from '@/lib/web-catalog/constants';
import { adaptCatalogBlock } from '@/lib/web-catalog/content-adapters';
import { parseNotionSourceRef, normalizeNotionPageId } from '@/lib/web-catalog/catalog-mapper';
import { buildSourcePageIndex, type SourcePageIndex } from '@/lib/web-catalog/links';
import type { WebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import { canLoadWebCatalogContent, usesGenericDocumentRenderer } from '@/lib/web-catalog/policy';
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

/** Resuelve child_page/child_database por ID en el índice del catálogo (no por título). */
function resolveChildSlugFromBlockId(blockId: string, sourceIndex: SourcePageIndex): string | null {
  const pageId = normalizeNotionPageId(blockId) ?? blockId.toLowerCase();
  const entry = sourceIndex.get(pageId) ?? sourceIndex.get(blockId.toLowerCase());
  if (!entry) return null;
  if (!canLoadWebCatalogContent(entry) || !usesGenericDocumentRenderer(entry)) return null;
  return entry.slug;
}

async function readBlocksRecursive(
  port: WebCatalogNotionPort,
  blockId: string,
  depth: number,
  state: { count: number; visited: Set<string> },
  sourceIndex: SourcePageIndex,
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
    const canTraverseChildren = raw.type !== 'child_page' && raw.type !== 'child_database';
    if (raw.has_children && canTraverseChildren && depth < WEB_CATALOG_READ_LIMITS.maxDepth) {
      const childResult = await readBlocksRecursive(port, raw.id, depth + 1, state, sourceIndex);
      if (!childResult.ok) return childResult;
      children = childResult.blocks;
    }

    const childSlug =
      raw.type === 'child_page' || raw.type === 'child_database'
        ? resolveChildSlugFromBlockId(raw.id, sourceIndex)
        : null;
    out.push(adaptCatalogBlock(raw, i, children, childSlug, sourceIndex));
  }

  return { ok: true, blocks: out };
}

export async function readWebCatalogContentPage(
  port: WebCatalogNotionPort,
  entry: WebCatalogEntry,
  _index: WebCatalogRouteIndex,
  catalogEntries: readonly WebCatalogEntry[] = [],
): Promise<ContentReadResult> {
  const pageId = parseNotionSourceRef(entry.sourceRef);
  if (!pageId) return { ok: false, code: 'invalid-source' };

  const meta = await port.retrievePageMeta(pageId);
  if (!meta.ok) return meta;

  const sourceIndex = buildSourcePageIndex(catalogEntries.length > 0 ? catalogEntries : [entry]);
  const state = { count: 0, visited: new Set<string>() };
  const blocksResult = await readBlocksRecursive(port, pageId, 0, state, sourceIndex);
  if (!blocksResult.ok) return blocksResult;

  const childPages: { slug: string; title: string }[] = [];
  const collectChildPages = (blocks: readonly ContentBlock[]) => {
    for (const block of blocks) {
      if (
        (block.type === 'child_page' || block.type === 'child_database') &&
        block.childPageSlug
      ) {
        childPages.push({
          slug: block.childPageSlug,
          title: block.childPageTitle ?? 'Recurso relacionado',
        });
      }
      if (block.children.length > 0) collectChildPages(block.children);
    }
  };
  collectChildPages(blocksResult.blocks);

  const page: ContentPage = {
    stableKey: entry.stableKey,
    slug: entry.slug,
    title: meta.title ?? entry.editorialName,
    icon: meta.icon,
    lastEditedAt: meta.lastEditedAt,
    renderMode: entry.renderMode,
    section: entry.section,
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
