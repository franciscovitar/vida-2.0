/**
 * Extracción de propiedades Notion → WebCatalogEntry (plano, sin SDK).
 * Nombres técnicos tienen prioridad; los editoriales son compatibilidad temporal.
 */
import {
  NOTION_SOURCE_REF_HOSTS,
  WEB_CATALOG_PROP_NAMES,
  WEB_CATALOG_SLUG_PATTERN,
} from '@/lib/web-catalog/constants';
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

export type CatalogMapFailureCode =
  'missing-required' | 'missing-source-ref' | 'invalid-source-ref' | 'invalid-alias';

export type CatalogMapResult =
  { ok: true; entry: WebCatalogEntry } | { ok: false; code: CatalogMapFailureCode };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Prioridad: primer nombre presente en properties (técnico primero). */
export function resolveCatalogProp(page: CatalogRawPage, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(page.properties, name)) {
      return page.properties[name];
    }
  }
  return undefined;
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

/** Une rich_text preservando saltos de línea (aliases: un alias por línea). */
function richTextRaw(prop: unknown): string | null {
  const obj = asRecord(prop);
  if (!obj || !Array.isArray(obj.rich_text)) return null;
  const text = obj.rich_text
    .map((part) => {
      const p = asRecord(part);
      return typeof p?.plain_text === 'string' ? p.plain_text : '';
    })
    .join('');
  return text;
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

function urlValue(prop: unknown): string | null {
  const obj = asRecord(prop);
  if (!obj || typeof obj.url !== 'string') return null;
  const trimmed = obj.url.trim();
  return trimmed === '' ? null : trimmed;
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
 * Normaliza un id Notion de 32 hex a UUID con guiones (solo servidor).
 */
export function normalizeNotionPageId(raw: string): string | null {
  const clean = raw.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) return null;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

/**
 * Extrae el id de página desde una URL Notion permitida.
 * Solo HTTPS, hostname exacto, sin credenciales ni puertos no estándar.
 * No acepta otros hosts. No usa título ni slug.
 */
export function extractNotionPageIdFromUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  if (parsed.port !== '') return null;
  if (!NOTION_SOURCE_REF_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const segments = parsed.pathname.split('/').filter((part) => part.length > 0);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1] ?? '';
  const match =
    /(?:^|-)([0-9a-fA-F]{32})$/.exec(last) ??
    /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.exec(last);
  if (!match?.[1]) return null;
  return normalizeNotionPageId(match[1]);
}

export type SourcePageIdResult =
  { ok: true; pageId: string } | { ok: false; code: 'missing-source-ref' | 'invalid-source-ref' };

/**
 * Resuelve sourceRef: URL (principal) o relation (compatibilidad).
 * Nunca usa el id de la fila del catálogo.
 */
export function resolveSourcePageId(sourceProp: unknown): SourcePageIdResult {
  const url = urlValue(sourceProp);
  if (url !== null) {
    const pageId = extractNotionPageIdFromUrl(url);
    if (!pageId) return { ok: false, code: 'invalid-source-ref' };
    return { ok: true, pageId };
  }

  const related = relationIds(sourceProp);
  if (related.length > 0) {
    const pageId = normalizeNotionPageId(related[0]!);
    if (!pageId) return { ok: false, code: 'invalid-source-ref' };
    return { ok: true, pageId };
  }

  return { ok: false, code: 'missing-source-ref' };
}

/**
 * aliases: rich_text (un alias por línea) principal; multi_select compatibilidad.
 * No omite alias inválidos: falla la fila.
 */
export function parseCatalogAliases(
  prop: unknown,
): { ok: true; aliases: string[] } | { ok: false; code: 'invalid-alias' } {
  if (prop === undefined || prop === null) return { ok: true, aliases: [] };

  const obj = asRecord(prop);
  if (!obj) return { ok: true, aliases: [] };

  let candidates: string[] = [];

  if (obj.type === 'multi_select' || Array.isArray(obj.multi_select)) {
    candidates = multiSelectNames(prop);
  } else if (obj.type === 'rich_text' || Array.isArray(obj.rich_text)) {
    const raw = richTextRaw(prop) ?? '';
    candidates = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } else {
    return { ok: true, aliases: [] };
  }

  for (const alias of candidates) {
    if (!WEB_CATALOG_SLUG_PATTERN.test(alias)) {
      return { ok: false, code: 'invalid-alias' };
    }
  }
  return { ok: true, aliases: candidates };
}

/**
 * Mapea una fila cruda al contrato con error tipado.
 * sourceRef queda solo como `notion:<pageId>` en servidor (sin URL cruda).
 */
export function mapCatalogRawPageResult(page: CatalogRawPage): CatalogMapResult {
  const editorialName =
    richTextPlain(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.editorialName)) ?? 'Sin título';
  const stableKey = richTextPlain(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.stableKey));
  const slug = richTextPlain(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.slug));
  if (!stableKey || !slug) return { ok: false, code: 'missing-required' };

  const sourceResolved = resolveSourcePageId(
    resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.sourceRef),
  );
  if (!sourceResolved.ok) return { ok: false, code: sourceResolved.code };

  const aliasesResult = parseCatalogAliases(
    resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.aliases),
  );
  if (!aliasesResult.ok) return aliasesResult;

  const status =
    parseEnum(selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.status)), STATUSES) ??
    'hidden';
  const section =
    parseEnum(selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.section)), SECTIONS) ??
    'reference';
  const privacy =
    parseEnum(selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.privacy)), PRIVACY) ??
    'general';
  const renderRaw =
    selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.renderMode)) ?? 'document';
  const renderMode: RenderMode = isAllowedWebCatalogRenderer(renderRaw)
    ? renderRaw
    : (renderRaw as RenderMode);

  const navigationPlacement =
    parseEnum(
      selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.navigationPlacement)),
      NAV,
    ) ?? 'none';
  const orderRaw = numberValue(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.navigationOrder));
  const navigationOrder =
    navigationPlacement === 'none' ? null : orderRaw !== null ? Math.trunc(orderRaw) : null;

  return {
    ok: true,
    entry: {
      stableKey,
      editorialName,
      sourceRef: `notion:${sourceResolved.pageId}`,
      status: status as WebCatalogStatus,
      canonical: checkboxValue(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.canonical)) === true,
      replacesResourceKey: richTextPlain(
        resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.replacesResourceKey),
      ),
      section: section as WebCatalogSection,
      slug,
      aliases: aliasesResult.aliases,
      navigationPlacement: navigationPlacement as NavigationPlacement,
      navigationOrder,
      renderMode,
      privacy: privacy as PrivacyLevel,
      policy: {
        visibleWeb:
          checkboxValue(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.visibleWeb)) === true,
        searchable:
          checkboxValue(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.searchable)) === true,
        generalAI:
          parseEnum(selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.generalAI)), AI) ??
          'denied',
        reviewAI:
          parseEnum(selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.reviewAI)), AI) ??
          'denied',
        writeMode:
          parseEnum(
            selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.writeMode)),
            WRITE,
          ) ?? 'none',
        confirmation:
          parseEnum(
            selectName(resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.confirmation)),
            CONFIRM,
          ) ?? 'none',
      },
    },
  };
}

/**
 * Mapea una fila cruda al contrato. Devuelve null si faltan campos o la referencia es inválida.
 */
export function mapCatalogRawPage(page: CatalogRawPage): WebCatalogEntry | null {
  const result = mapCatalogRawPageResult(page);
  return result.ok ? result.entry : null;
}

export function mapCatalogRawPages(pages: readonly CatalogRawPage[]): WebCatalogEntry[] {
  const entries: WebCatalogEntry[] = [];
  for (const page of pages) {
    const mapped = mapCatalogRawPage(page);
    if (mapped) entries.push(mapped);
  }
  return entries;
}

/** Extrae el ID de página de un sourceRef de servidor (`notion:<id>`). */
export function parseNotionSourceRef(sourceRef: string): string | null {
  const match = /^notion:([0-9a-fA-F-]{32,})$/.exec(sourceRef.trim());
  if (!match?.[1]) return null;
  return normalizeNotionPageId(match[1]) ?? match[1];
}
