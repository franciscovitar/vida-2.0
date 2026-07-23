/**
 * Feature flag y configuración de servidor del Registro Web.
 * Nunca expone IDs ni tokens al cliente.
 */
export function isWebCatalogEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.WEB_CATALOG_ENABLED === 'true';
}

export type WebCatalogNotionConfig =
  { ok: true; token: string; dataSourceId: string } | { ok: false; reason: 'not-configured' };

/**
 * Configuración Notion del catálogo.
 * El data source ID solo puede venir de entorno (sin hardcode).
 */
export function getWebCatalogNotionConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WebCatalogNotionConfig {
  // Permite separar la lectura documental de las capacidades operativas de
  // Notion. El fallback conserva compatibilidad hasta configurar una
  // integración dedicada de solo lectura.
  const token = env.NOTION_WEB_CATALOG_API_TOKEN?.trim() || env.NOTION_API_TOKEN?.trim();
  const dataSourceId = env.NOTION_WEB_CATALOG_DATA_SOURCE_ID?.trim();
  if (!token || !dataSourceId) return { ok: false, reason: 'not-configured' };
  return { ok: true, token, dataSourceId };
}

/** true solo si el ID coincide exactamente con el configurado en entorno. */
export function isAllowedWebCatalogDataSourceId(
  id: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const configured = env.NOTION_WEB_CATALOG_DATA_SOURCE_ID?.trim();
  return Boolean(configured && configured === id.trim());
}
