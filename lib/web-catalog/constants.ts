/**
 * Nombres de propiedades del Registro Web (no IDs de data source).
 * El nombre técnico es el principal; el editorial se mantiene por compatibilidad temporal.
 */

export const WEB_CATALOG_PROP_NAMES = {
  editorialName: ['Name', 'Nombre editorial'],
  stableKey: ['stableKey', 'Clave estable'],
  sourceRef: ['sourceRef', 'Página origen'],
  status: ['status', 'Estado'],
  canonical: ['canonical', 'Canónico'],
  replacesResourceKey: ['replacesResourceKey', 'Reemplaza'],
  section: ['section', 'Sección'],
  slug: ['slug', 'Slug'],
  aliases: ['aliases', 'Alias'],
  navigationPlacement: ['navigationPlacement', 'Navegación'],
  navigationOrder: ['navigationOrder', 'Orden'],
  renderMode: ['renderMode', 'Renderer'],
  privacy: ['privacy', 'Privacidad'],
  visibleWeb: ['visibleWeb', 'Visible web'],
  searchable: ['searchable', 'Buscable'],
  generalAI: ['generalAI', 'IA general'],
  reviewAI: ['reviewAI', 'IA revisión'],
  writeMode: ['writeMode', 'Escritura'],
  confirmation: ['confirmation', 'Confirmación'],
} as const;

/** @deprecated Preferir WEB_CATALOG_PROP_NAMES; se conserva para lecturas editoriales. */
export const WEB_CATALOG_PROPS = {
  editorialName: 'Nombre editorial',
  stableKey: 'Clave estable',
  sourcePage: 'Página origen',
  status: 'Estado',
  canonical: 'Canónico',
  replacesResourceKey: 'Reemplaza',
  section: 'Sección',
  slug: 'Slug',
  aliases: 'Alias',
  navigationPlacement: 'Navegación',
  navigationOrder: 'Orden',
  renderMode: 'Renderer',
  privacy: 'Privacidad',
  visibleWeb: 'Visible web',
  searchable: 'Buscable',
  generalAI: 'IA general',
  reviewAI: 'IA revisión',
  writeMode: 'Escritura',
  confirmation: 'Confirmación',
} as const;

/** Hosts permitidos para sourceRef URL (solo servidor; comparación exacta). */
export const NOTION_SOURCE_REF_HOSTS = new Set(['notion.so', 'www.notion.so', 'app.notion.com']);

/** Límites seguros del lector recursivo. */
export const WEB_CATALOG_READ_LIMITS = {
  maxDepth: 6,
  maxBlocks: 400,
  revalidateSeconds: 60,
} as const;

/** Formato de slug/alias compartido con el validador. */
export const WEB_CATALOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
