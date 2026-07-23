/**
 * Adaptadores de bloques Notion → ContentBlock normalizado.
 * Los hrefs pasan por resolveContentHref (sin URLs Notion al cliente).
 */
import type { CatalogRawBlock } from '@/lib/web-catalog/notion-port';
import {
  resolveContentHref,
  resolvedHrefToTextFields,
  type SourcePageIndex,
} from '@/lib/web-catalog/links';
import type {
  ContentAsset,
  ContentBlock,
  ContentBlockType,
  ContentLink,
  ContentText,
  ContentTextAnnotations,
  ContentTextColor,
} from '@/types/content';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

const CONTENT_TEXT_COLORS = new Set<ContentTextColor>([
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
  'gray_background',
  'brown_background',
  'orange_background',
  'yellow_background',
  'green_background',
  'blue_background',
  'purple_background',
  'pink_background',
  'red_background',
]);

function textColor(value: unknown): ContentTextColor {
  return typeof value === 'string' && CONTENT_TEXT_COLORS.has(value as ContentTextColor)
    ? (value as ContentTextColor)
    : 'default';
}

function annotationsFromPart(part: Record<string, unknown>): ContentTextAnnotations | undefined {
  const raw = asRecord(part.annotations);
  if (!raw) return undefined;

  const annotations: ContentTextAnnotations = {
    bold: raw.bold === true,
    italic: raw.italic === true,
    strikethrough: raw.strikethrough === true,
    underline: raw.underline === true,
    code: raw.code === true,
    color: textColor(raw.color),
  };

  const hasDecoration =
    annotations.bold ||
    annotations.italic ||
    annotations.strikethrough ||
    annotations.underline ||
    annotations.code ||
    annotations.color !== 'default';

  return hasDecoration ? annotations : undefined;
}

function richParts(value: unknown, sourceIndex: SourcePageIndex): ContentText[] {
  if (!Array.isArray(value)) return [];
  const parts: ContentText[] = [];
  for (const item of value) {
    const part = asRecord(item);
    if (!part || typeof part.plain_text !== 'string') continue;
    const plain = part.plain_text;
    const linkObj = asRecord(part.href ? { url: part.href } : asRecord(part.text)?.link);
    const rawHref =
      typeof part.href === 'string'
        ? part.href
        : typeof linkObj?.url === 'string'
          ? linkObj.url
          : null;
    const fields = resolvedHrefToTextFields(resolveContentHref(rawHref, sourceIndex));
    const annotations = annotationsFromPart(part);
    parts.push({
      plain,
      href: fields.href,
      ...(annotations ? { annotations } : {}),
      ...(fields.unavailable ? { unavailable: true } : {}),
      ...(fields.external ? { external: true } : {}),
    });
  }
  return parts;
}

/** URLs de assets (imágenes): http(s) básico; no reescribe Notion→/p. */
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
  'child_database',
]);

function localIdFromNotionId(id: string, index: number): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `b${hash.toString(36)}${index.toString(36)}`;
}

export function adaptCatalogBlock(
  block: CatalogRawBlock,
  index: number,
  children: readonly ContentBlock[],
  childPageSlug: string | null,
  sourceIndex: SourcePageIndex = new Map(),
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
    text = richParts(payload.rich_text, sourceIndex);
  } else if (type === 'to_do') {
    text = richParts(payload.rich_text, sourceIndex);
    checked = typeof payload.checked === 'boolean' ? payload.checked : false;
  } else if (type === 'code') {
    text = richParts(payload.rich_text, sourceIndex);
    language = typeof payload.language === 'string' ? payload.language : null;
  } else if (type === 'bookmark') {
    const rawUrl = typeof payload.url === 'string' ? payload.url : null;
    const resolved = resolveContentHref(rawUrl, sourceIndex);
    const fields = resolvedHrefToTextFields(resolved);
    if (fields.href) {
      link = {
        url: fields.href,
        label: null,
        ...(fields.external ? { external: true } : {}),
      };
    } else if (fields.unavailable) {
      link = { url: '', label: null, unavailable: true };
    } else {
      link = null;
    }
    text = richParts(payload.caption, sourceIndex);
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
            richParts(payload.caption, sourceIndex)
              .map((t) => t.plain)
              .join('') || null,
        }
      : null;
  } else if (type === 'child_page' || type === 'child_database') {
    childPageTitle = typeof payload.title === 'string' ? payload.title : 'Recurso relacionado';
  }

  const isChildResource = type === 'child_page' || type === 'child_database';

  return {
    localId: localIdFromNotionId(block.id, index),
    type,
    text,
    checked,
    language,
    link,
    asset,
    childPageSlug: isChildResource ? childPageSlug : null,
    childPageTitle: isChildResource ? childPageTitle : null,
    children,
  };
}
