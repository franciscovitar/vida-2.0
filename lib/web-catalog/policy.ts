/**
 * Barreras de política: se evalúan antes de leer páginas o bloques.
 * Una sola evaluación central reutilizada por rutas, navegación y búsqueda.
 */
import type { WebCatalogEntry } from '@/types/web-catalog';

/**
 * true solo si el recurso puede publicarse por la ruta dinámica general
 * y el renderer genérico de documentos.
 */
export function canLoadWebCatalogContent(entry: WebCatalogEntry): boolean {
  if (entry.status !== 'published') return false;
  if (!entry.canonical) return false;
  if (!entry.policy.visibleWeb) return false;
  if (entry.privacy === 'private' || entry.privacy === 'system' || entry.privacy === 'excluded') {
    return false;
  }
  return true;
}

/** true si el renderer genérico de documentos puede usarse. */
export function usesGenericDocumentRenderer(entry: WebCatalogEntry): boolean {
  return entry.renderMode === 'document';
}

/** Renderers especiales que reutilizan la lectura normalizada y una vista segura en código. */
export function usesReadableContentRenderer(entry: WebCatalogEntry): boolean {
  return (
    entry.renderMode === 'document' ||
    entry.renderMode === 'faculty' ||
    entry.renderMode === 'functional-module'
  );
}

/** Protección tipada: recursos privados nunca entran al lector general. */
export function isPrivateWebCatalogEntry(entry: WebCatalogEntry): boolean {
  return entry.privacy === 'private';
}

/**
 * Entrada elegible para navegación dinámica documental.
 * Renderers especiales sin pantalla implementada no aparecen.
 */
export function canNavigateWebCatalogEntry(entry: WebCatalogEntry): boolean {
  if (!canLoadWebCatalogContent(entry)) return false;
  if (entry.navigationPlacement === 'none') return false;
  if (!usesGenericDocumentRenderer(entry)) return false;
  return true;
}

/**
 * Entrada elegible para búsqueda general autenticada.
 * Journaling/privados/sistema/legacy/excluidos y no canónicos quedan fuera.
 * Debe reevaluarse con el catálogo actual, no solo con el índice cacheado.
 */
export function canSearchWebCatalogEntry(entry: WebCatalogEntry): boolean {
  if (!canLoadWebCatalogContent(entry)) return false;
  if (!entry.policy.searchable) return false;
  return true;
}
