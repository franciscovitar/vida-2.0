/**
 * Nombres editoriales de propiedades del Registro Web (no IDs).
 * Deben coincidir con la base Notion; no se hardcodean data source IDs.
 */

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

/** Límites seguros del lector recursivo. */
export const WEB_CATALOG_READ_LIMITS = {
  maxDepth: 6,
  maxBlocks: 400,
  revalidateSeconds: 60,
} as const;
