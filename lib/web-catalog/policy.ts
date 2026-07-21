/**
 * Barreras de política: se evalúan antes de leer páginas o bloques.
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

/** Protección tipada: recursos privados nunca entran al lector general. */
export function isPrivateWebCatalogEntry(entry: WebCatalogEntry): boolean {
  return entry.privacy === 'private';
}
