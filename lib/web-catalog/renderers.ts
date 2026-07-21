import type { RenderMode } from '@/types/web-catalog';

/**
 * Registro cerrado de renderers. El catálogo solo puede seleccionar estas claves;
 * nunca puede convertir texto externo en código ejecutable.
 */
export const ALLOWED_WEB_CATALOG_RENDERERS = [
  'document',
  'area',
  'faculty',
  'health',
  'gym',
  'operational-database',
  'functional-module',
  'system',
  'private',
] as const satisfies readonly RenderMode[];

const allowedRenderers = new Set<string>(ALLOWED_WEB_CATALOG_RENDERERS);

export function isAllowedWebCatalogRenderer(value: string): value is RenderMode {
  return allowedRenderers.has(value);
}
