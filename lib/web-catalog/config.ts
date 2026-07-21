/**
 * Feature flag de servidor para el futuro Registro Web.
 * 8B.1 no la conecta con rutas, navegación ni UI.
 */
export function isWebCatalogEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.WEB_CATALOG_ENABLED === 'true';
}
