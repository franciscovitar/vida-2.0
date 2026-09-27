export type RichAssetKind = 'link' | 'image' | 'audio' | 'video' | 'source';

export interface RichRenderPolicy {
  allowedRemoteHosts?: readonly string[];
  allowedLocalPrefixes?: readonly string[];
}

export type RichContentBlock =
  | { kind: 'html'; html: string }
  | { kind: 'markdown'; markdown: string }
  | { kind: 'code'; code: string; language?: string }
  | { kind: 'math'; tex: string; display?: boolean }
  | { kind: 'image'; src: string; alt: string; caption?: string }
  | { kind: 'audio'; src: string; title?: string }
  | { kind: 'video'; src: string; title?: string; poster?: string };

export interface SafeElementSpec {
  tag: string;
  props: Record<string, unknown>;
  isVoid: boolean;
}

const DEFAULT_LOCAL_PREFIXES = ['/study-media/', '/assets/'] as const;

export const SAFE_RICH_TAGS = new Set([
  'p',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'img',
  'audio',
  'video',
  'source',
  'svg',
  'g',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img', 'source']);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\r\n]+$/i;
const SAFE_NUMBER = /^-?\d+(?:\.\d+)?%?$/;
const SAFE_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;
const SAFE_POINTS = /^[-+\d.eE,\s]+$/;

const STYLE_PROPERTY_MAP = {
  color: 'color',
  'background-color': 'backgroundColor',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'text-decoration': 'textDecoration',
  'text-align': 'textAlign',
  'white-space': 'whiteSpace',
} as const;

function allowedLocalPrefixes(policy: RichRenderPolicy): readonly string[] {
  return policy.allowedLocalPrefixes ?? DEFAULT_LOCAL_PREFIXES;
}

function isAllowedLocalAsset(value: string, policy: RichRenderPolicy): boolean {
  if (value.startsWith('//')) return false;
  return allowedLocalPrefixes(policy).some((prefix) => value.startsWith(prefix));
}

function isAllowedRemoteHost(hostname: string, policy: RichRenderPolicy): boolean {
  return (policy.allowedRemoteHosts ?? []).some(
    (allowed) => hostname === allowed || hostname.endsWith('.' + allowed),
  );
}

export function sanitizeRichUrl(
  raw: string,
  kind: RichAssetKind,
  policy: RichRenderPolicy = {},
): string | null {
  const value = raw.trim();
  if (!value || value.length > 1_000_000 || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  if (kind === 'link') {
    if (value.startsWith('#')) return value;
    if (value.startsWith('/') && !value.startsWith('//')) return value;
  } else if (isAllowedLocalAsset(value, policy)) {
    return value;
  }

  if (kind === 'image' && SAFE_DATA_IMAGE.test(value)) {
    return value;
  }

  if (kind !== 'link' && value.startsWith('blob:')) {
    return value;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (kind === 'link' && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) {
    return parsed.toString();
  }

  if (
    kind !== 'link' &&
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    isAllowedRemoteHost(parsed.hostname, policy)
  ) {
    return parsed.toString();
  }

  return null;
}

function safeColor(value: string): boolean {
  const normalized = value.trim();
  return (
    /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(
      normalized,
    ) || /^(?:transparent|currentcolor|black|white|red|green|blue|gray|grey)$/i.test(normalized)
  );
}

export function sanitizeInlineStyle(raw: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const declaration of raw.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator <= 0) continue;

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    const target = STYLE_PROPERTY_MAP[property as keyof typeof STYLE_PROPERTY_MAP];

    if (!target || !value || value.length > 80) continue;
    if (/url\s*\(|expression\s*\(|@import|javascript:|\\/i.test(value)) continue;

    const allowed =
      (property === 'color' || property === 'background-color') ? safeColor(value) :
      property === 'font-weight' ? /^(?:normal|bold|[1-9]00)$/i.test(value) :
      property === 'font-style' ? /^(?:normal|italic|oblique)$/i.test(value) :
      property === 'text-decoration' ? /^(?:none|underline|line-through)$/i.test(value) :
      property === 'text-align' ? /^(?:left|right|center|justify)$/i.test(value) :
      property === 'white-space' ? /^(?:normal|pre|pre-wrap|nowrap)$/i.test(value) :
      false;

    if (allowed) result[target] = value;
  }

  return result;
}

function safeDimension(value: string | undefined): number | undefined {
  if (!value || !/^\d{1,4}$/.test(value)) return undefined;
  const number = Number(value);
  return number >= 1 && number <= 4096 ? number : undefined;
}

function safeSvgValue(value: string | undefined): string | undefined {
  if (!value || value.length > 80) return undefined;
  return SAFE_NUMBER.test(value) ? value : undefined;
}

function safeSvgPaint(value: string | undefined): string | undefined {
  if (!value || value.length > 80 || /url\s*\(/i.test(value)) return undefined;
  return safeColor(value) || /^(?:none|currentColor)$/i.test(value) ? value : undefined;
}

function addSvgProps(attrs: Record<string, string>, props: Record<string, unknown>) {
  const viewBox = attrs.viewbox;
  if (viewBox && /^[-+\d.eE\s]+$/.test(viewBox) && viewBox.length <= 100) {
    props.viewBox = viewBox;
  }

  for (const name of ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry']) {
    const safe = safeSvgValue(attrs[name]);
    if (safe) props[name] = safe;
  }

  const width = safeSvgValue(attrs.width);
  const height = safeSvgValue(attrs.height);
  const fill = safeSvgPaint(attrs.fill);
  const stroke = safeSvgPaint(attrs.stroke);
  const strokeWidth = safeSvgValue(attrs['stroke-width']);

  if (width) props.width = width;
  if (height) props.height = height;
  if (fill) props.fill = fill;
  if (stroke) props.stroke = stroke;
  if (strokeWidth) props.strokeWidth = strokeWidth;

  if (attrs.d && attrs.d.length <= 5000 && SAFE_PATH.test(attrs.d)) props.d = attrs.d;
  if (attrs.points && attrs.points.length <= 5000 && SAFE_POINTS.test(attrs.points)) {
    props.points = attrs.points;
  }
}

export function buildSafeElementSpec(
  tagName: string,
  rawAttrs: Record<string, string>,
  policy: RichRenderPolicy = {},
): SafeElementSpec | null {
  const tag = tagName.toLowerCase();
  if (!SAFE_RICH_TAGS.has(tag)) return null;

  const attrs = Object.fromEntries(
    Object.entries(rawAttrs).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const props: Record<string, unknown> = {};

  if (attrs.title && attrs.title.length <= 300) props.title = attrs.title;
  if (attrs.role && /^[a-z-]+$/i.test(attrs.role)) props.role = attrs.role;
  if (attrs['aria-label'] && attrs['aria-label'].length <= 300) {
    props['aria-label'] = attrs['aria-label'];
  }
  if (attrs['aria-hidden'] === 'true' || attrs['aria-hidden'] === 'false') {
    props['aria-hidden'] = attrs['aria-hidden'];
  }

  if (attrs.style) {
    const style = sanitizeInlineStyle(attrs.style);
    if (Object.keys(style).length > 0) props.style = style;
  }

  if (tag === 'a') {
    const href = sanitizeRichUrl(attrs.href ?? '', 'link', policy);
    if (href) {
      props.href = href;
      if (/^https?:/i.test(href)) {
        props.target = '_blank';
        props.rel = 'noreferrer noopener';
        props.referrerPolicy = 'no-referrer';
      }
    }
  }

  if (tag === 'img') {
    const src = sanitizeRichUrl(attrs.src ?? '', 'image', policy);
    if (!src) return null;
    props.src = src;
    props.alt = (attrs.alt ?? '').slice(0, 500);
    props.loading = 'lazy';
    props.decoding = 'async';
    props.referrerPolicy = 'no-referrer';

    const width = safeDimension(attrs.width);
    const height = safeDimension(attrs.height);
    if (width) props.width = width;
    if (height) props.height = height;
  }

  if (tag === 'audio' || tag === 'video') {
    const src = sanitizeRichUrl(attrs.src ?? '', tag, policy);
    if (!src) return null;
    props.src = src;
    props.controls = true;
    props.preload = 'metadata';

    if (tag === 'video' && attrs.poster) {
      const poster = sanitizeRichUrl(attrs.poster, 'image', policy);
      if (poster) props.poster = poster;
    }
  }

  if (tag === 'source') {
    const src = sanitizeRichUrl(attrs.src ?? '', 'source', policy);
    if (!src) return null;
    props.src = src;
    if (attrs.type && /^(?:image|audio|video)\/[a-z0-9.+-]+$/i.test(attrs.type)) {
      props.type = attrs.type;
    }
  }

  if (tag === 'td' || tag === 'th') {
    const colSpan = safeDimension(attrs.colspan);
    const rowSpan = safeDimension(attrs.rowspan);
    if (colSpan) props.colSpan = colSpan;
    if (rowSpan) props.rowSpan = rowSpan;
  }

  if (
    tag === 'svg' ||
    tag === 'g' ||
    tag === 'path' ||
    tag === 'circle' ||
    tag === 'rect' ||
    tag === 'line' ||
    tag === 'polyline' ||
    tag === 'polygon' ||
    tag === 'text'
  ) {
    addSvgProps(attrs, props);
  }

  return { tag, props, isVoid: VOID_TAGS.has(tag) };
}
