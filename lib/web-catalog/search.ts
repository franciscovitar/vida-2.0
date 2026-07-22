/**
 * Búsqueda textual acotada sobre contenido autorizado del Registro Web.
 */
import {
  WEB_CATALOG_SEARCH_LIMITS,
  WEB_CATALOG_SECTION_LABELS,
} from '@/lib/web-catalog/section-labels';
import { canSearchWebCatalogEntry } from '@/lib/web-catalog/policy';
import type { ContentBlock, ContentPage } from '@/types/content';
import type { WebCatalogEntry, WebCatalogSection } from '@/types/web-catalog';

export type WebCatalogSearchHit = {
  title: string;
  section: WebCatalogSection;
  sectionLabel: string;
  snippet: string;
  href: string;
};

export type SearchableDocument = {
  stableKey: string;
  title: string;
  section: WebCatalogSection;
  aliases: readonly string[];
  href: string;
  body: string;
};

function collectPlain(blocks: readonly ContentBlock[]): string[] {
  const parts: string[] = [];
  for (const block of blocks) {
    if (
      block.type === 'paragraph' ||
      block.type === 'heading_1' ||
      block.type === 'heading_2' ||
      block.type === 'heading_3' ||
      block.type === 'bulleted_list_item' ||
      block.type === 'numbered_list_item' ||
      block.type === 'to_do' ||
      block.type === 'quote' ||
      block.type === 'callout'
    ) {
      const text = block.text.map((t) => t.plain).join('');
      if (text.trim()) parts.push(text);
    }
    if (block.children.length > 0) parts.push(...collectPlain(block.children));
  }
  return parts;
}

export function buildSearchableDocument(
  entry: WebCatalogEntry,
  page: Pick<ContentPage, 'title' | 'blocks'>,
): SearchableDocument | null {
  if (!canSearchWebCatalogEntry(entry)) return null;
  const body = collectPlain(page.blocks).join('\n');
  return {
    stableKey: entry.stableKey,
    title: page.title || entry.editorialName,
    section: entry.section,
    aliases: entry.aliases,
    href: `/p/${entry.slug}`,
    body,
  };
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().slice(0, WEB_CATALOG_SEARCH_LIMITS.maxQueryLength);
}

function snippetAround(haystack: string, needle: string): string {
  const lower = haystack.toLowerCase();
  const index = lower.indexOf(needle);
  const max = WEB_CATALOG_SEARCH_LIMITS.maxSnippetLength;
  if (index < 0) {
    const base = haystack.trim().slice(0, max);
    return base.length < haystack.trim().length ? `${base}…` : base;
  }
  const start = Math.max(0, index - 40);
  const end = Math.min(haystack.length, start + max);
  let snippet = haystack.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < haystack.length) snippet = `${snippet}…`;
  return snippet;
}

/**
 * Busca en documentos ya materializados (fixtures o índice de servidor).
 * Query vacía → sin resultados (no ejecuta búsqueda).
 */
export function searchWebCatalogDocuments(
  documents: readonly SearchableDocument[],
  rawQuery: string,
): WebCatalogSearchHit[] {
  const query = normalizeQuery(rawQuery);
  if (query === '') return [];

  const hits: WebCatalogSearchHit[] = [];
  for (const doc of documents) {
    const titleMatch = doc.title.toLowerCase().includes(query);
    const sectionLabel = WEB_CATALOG_SECTION_LABELS[doc.section];
    const sectionMatch = sectionLabel.toLowerCase().includes(query);
    const aliasMatch = doc.aliases.some((alias) => alias.toLowerCase().includes(query));
    const bodyMatch = doc.body.toLowerCase().includes(query);
    if (!titleMatch && !sectionMatch && !aliasMatch && !bodyMatch) continue;

    const snippetSource = bodyMatch
      ? doc.body
      : titleMatch
        ? doc.title
        : aliasMatch
          ? doc.aliases.join(' ')
          : sectionLabel;

    hits.push({
      title: doc.title,
      section: doc.section,
      sectionLabel,
      snippet: snippetAround(snippetSource, query),
      href: doc.href,
    });

    if (hits.length >= WEB_CATALOG_SEARCH_LIMITS.maxResults) break;
  }

  return hits;
}
