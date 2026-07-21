/**
 * Adaptadores de bloques Notion → ContentBlock normalizado.
 */
import type { CatalogRawBlock } from '@/lib/web-catalog/notion-port';
import type {
  ContentAsset,
  ContentBlock,
  ContentBlockType,
  ContentLink,
  ContentText,
} from '@/types/content';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function richParts(value: unknown): ContentText[] {
  if (!Array.isArray(value)) return [];
  const parts: ContentText[] = [];
  for (const item of value) {
    const part = asRecord(item);
    if (!part || typeof part.plain_text !== 'string') continue;
    const plain = part.plain_text;
    const linkObj = asRecord(part.href ? { url: part.href } : asRecord(part.text)?.link);
    const href =
      typeof part.href === 'string'
        ? part.href
        : typeof linkObj?.url === 'string'
          ? linkObj.url
          : null;
    parts.push({ plain, href: isSafeHttpUrl(href) ? href : null });
  }
  return parts;
}

export function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function payloadForType(raw: Record<string, unknown>, type: string): Record<string, unknown> {
  return asRecord(raw[type]) ?? {};
}

const SUPPORTED = new Set<string>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'callout',
  'divider',
  'toggle',
  'code',
  'bookmark',
  'image',
  'child_page',
]);

function localIdFromNotionId(id: string, index: number): string {
  // Identificador local opaco: no reenvía el UUID de Notion.
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `b${hash.toString(36)}${index.toString(36)}`;
}

export function adaptCatalogBlock(
  block: CatalogRawBlock,
  index: number,
  children: readonly ContentBlock[],
  childPageSlug: string | null,
): ContentBlock {
  const type = SUPPORTED.has(block.type) ? (block.type as ContentBlockType) : 'unsupported';
  const payload = payloadForType(block.raw, block.type);

  let text: ContentText[] = [];
  let checked: boolean | null = null;
  let language: string | null = null;
  let link: ContentLink | null = null;
  let asset: ContentAsset | null = null;
  let childPageTitle: string | null = null;

  if (
    type === 'paragraph' ||
    type === 'heading_1' ||
    type === 'heading_2' ||
    type === 'heading_3' ||
    type === 'bulleted_list_item' ||
    type === 'numbered_list_item' ||
    type === 'quote' ||
    type === 'callout' ||
    type === 'toggle'
  ) {
    text = richParts(payload.rich_text);
  } else if (type === 'to_do') {
    text = richParts(payload.rich_text);
    checked = typeof payload.checked === 'boolean' ? payload.checked : false;
  } else if (type === 'code') {
    text = richParts(payload.rich_text);
    language = typeof payload.language === 'string' ? payload.language : null;
  } else if (type === 'bookmark') {
    const url = typeof payload.url === 'string' && isSafeHttpUrl(payload.url) ? payload.url : null;
    link = url ? { url, label: null } : null;
    text = richParts(payload.caption);
  } else if (type === 'image') {
    const file = asRecord(payload.file);
    const external = asRecord(payload.external);
    const urlCandidate =
      (typeof file?.url === 'string' ? file.url : null) ??
      (typeof external?.url === 'string' ? external.url : null);
    const url = isSafeHttpUrl(urlCandidate) ? urlCandidate : null;
    asset = url
      ? {
          kind: 'image',
          url,
          caption:
            richParts(payload.caption)
              .map((t) => t.plain)
              .join('') || null,
        }
      : null;
  } else if (type === 'child_page') {
    childPageTitle = typeof payload.title === 'string' ? payload.title : 'Página';
  }

  return {
    localId: localIdFromNotionId(block.id, index),
    type,
    text,
    checked,
    language,
    link,
    asset,
    childPageSlug: type === 'child_page' ? childPageSlug : null,
    childPageTitle: type === 'child_page' ? childPageTitle : null,
    children,
  };
}
