/**
 * Extracción de propiedades Notion → WebCatalogEntry (plano, sin SDK).
 */
import { WEB_CATALOG_PROPS } from '@/lib/web-catalog/constants';
import { isAllowedWebCatalogRenderer } from '@/lib/web-catalog/renderers';
import type {
  NavigationPlacement,
  PrivacyLevel,
  RenderMode,
  WebCatalogEntry,
  WebCatalogSection,
  WebCatalogStatus,
} from '@/types/web-catalog';

export type CatalogRawPage = {
  id: string;
  properties: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function richTextPlain(prop: unknown): string | null {
  const obj = asRecord(prop);
  if (!obj) return null;
  const rich = Array.isArray(obj.rich_text)
    ? obj.rich_text
    : Array.isArray(obj.title)
      ? obj.title
      : null;
  if (!rich) return null;
  const text = rich
    .map((part) => {
      const p = asRecord(part);
      return typeof p?.plain_text === 'string' ? p.plain_text : '';
    })
    .join('')
    .trim();
  return text === '' ? null : text;
}

function selectName(prop: unknown): string | null {
  const obj = asRecord(prop);
  if (!obj) return null;
  const select = asRecord(obj.select) ?? asRecord(obj.status);
  return typeof select?.name === 'string' ? select.name : null;
}

function checkboxValue(prop: unknown): boolean | null {
  const obj = asRecord(prop);
  if (!obj || typeof obj.checkbox !== 'boolean') return null;
  return obj.checkbox;
}

function numberValue(prop: unknown): number | null {
  const obj = asRecord(prop);
  if (!obj || typeof obj.number !== 'number' || !Number.isFinite(obj.number)) return null;
  return obj.number;
}

function multiSelectNames(prop: unknown): string[] {
  const obj = asRecord(prop);
  if (!obj || !Array.isArray(obj.multi_select)) return [];
  const names: string[] = [];
  for (const item of obj.multi_select) {
    const row = asRecord(item);
    if (typeof row?.name === 'string' && row.name.trim() !== '') names.push(row.name.trim());
  }
  return names;
}

function relationIds(prop: unknown): string[] {
  const obj = asRecord(prop);
  if (!obj || !Array.isArray(obj.relation)) return [];
  const ids: string[] = [];
  for (const item of obj.relation) {
    const rel = asRecord(item);
    if (typeof rel?.id === 'string') ids.push(rel.id);
  }
  return ids;
}

function prop(page: CatalogRawPage, key: string): unknown {
  return page.properties[key];
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const STATUSES = ['draft', 'published', 'hidden', 'legacy', 'excluded'] as const;
const SECTIONS = [
  'today',
  'operations',
  'areas',
  'personal-systems',
  'reference',
  'system',
  'private',
  'archive',
] as const;
const PRIVACY = ['general', 'sensitive', 'private', 'system', 'excluded'] as const;
const AI = ['allowed', 'limited', 'explicit-authorization', 'denied'] as const;
const WRITE = ['none', 'proposal', 'properties', 'content', 'special-module'] as const;
const CONFIRM = ['none', 'explicit', 'reinforced'] as const;
const NAV = ['primary', 'secondary', 'contextual', 'none'] as const;

/**
 * Mapea una fila cruda al contrato. Devuelve null si faltan campos mínimos.
 * sourceRef es solo de servidor (página de contenido).
 */
export function mapCatalogRawPage(page: CatalogRawPage): WebCatalogEntry | null {
  const editorialName =
    richTextPlain(prop(page, WEB_CATALOG_PROPS.editorialName)) ??
    richTextPlain(prop(page, 'Name')) ??
    'Sin título';
  const stableKey = richTextPlain(prop(page, WEB_CATALOG_PROPS.stableKey));
  const slug = richTextPlain(prop(page, WEB_CATALOG_PROPS.slug));
  if (!stableKey || !slug) return null;

  const status = parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.status)), STATUSES) ?? 'hidden';
  const section =
    parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.section)), SECTIONS) ?? 'reference';
  const privacy =
    parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.privacy)), PRIVACY) ?? 'general';
  const renderRaw = selectName(prop(page, WEB_CATALOG_PROPS.renderMode)) ?? 'document';
  const renderMode: RenderMode = isAllowedWebCatalogRenderer(renderRaw)
    ? renderRaw
    : (renderRaw as RenderMode);

  const navigationPlacement =
    parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.navigationPlacement)), NAV) ?? 'none';
  const orderRaw = numberValue(prop(page, WEB_CATALOG_PROPS.navigationOrder));
  const navigationOrder =
    navigationPlacement === 'none' ? null : orderRaw !== null ? Math.trunc(orderRaw) : null;

  const related = relationIds(prop(page, WEB_CATALOG_PROPS.sourcePage));
  const contentPageId = related[0] ?? page.id;

  return {
    stableKey,
    editorialName,
    sourceRef: `notion:${contentPageId}`,
    status: status as WebCatalogStatus,
    canonical: checkboxValue(prop(page, WEB_CATALOG_PROPS.canonical)) === true,
    replacesResourceKey: richTextPlain(prop(page, WEB_CATALOG_PROPS.replacesResourceKey)),
    section: section as WebCatalogSection,
    slug,
    aliases: multiSelectNames(prop(page, WEB_CATALOG_PROPS.aliases)),
    navigationPlacement: navigationPlacement as NavigationPlacement,
    navigationOrder,
    renderMode,
    privacy: privacy as PrivacyLevel,
    policy: {
      visibleWeb: checkboxValue(prop(page, WEB_CATALOG_PROPS.visibleWeb)) === true,
      searchable: checkboxValue(prop(page, WEB_CATALOG_PROPS.searchable)) === true,
      generalAI: parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.generalAI)), AI) ?? 'denied',
      reviewAI: parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.reviewAI)), AI) ?? 'denied',
      writeMode: parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.writeMode)), WRITE) ?? 'none',
      confirmation:
        parseEnum(selectName(prop(page, WEB_CATALOG_PROPS.confirmation)), CONFIRM) ?? 'none',
    },
  };
}

export function mapCatalogRawPages(pages: readonly CatalogRawPage[]): WebCatalogEntry[] {
  const entries: WebCatalogEntry[] = [];
  for (const page of pages) {
    const mapped = mapCatalogRawPage(page);
    if (mapped) entries.push(mapped);
  }
  return entries;
}

/** Extrae el ID de página de un sourceRef de servidor. */
export function parseNotionSourceRef(sourceRef: string): string | null {
  const match = /^notion:([0-9a-fA-F-]{32,})$/.exec(sourceRef.trim());
  return match ? match[1] : null;
}
