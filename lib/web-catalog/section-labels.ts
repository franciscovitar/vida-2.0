/**
 * Etiquetas y rutas fijas documentales del Registro Web.
 */

import type { WebCatalogSection } from '@/types/web-catalog';

export const WEB_CATALOG_SECTION_LABELS: Record<WebCatalogSection, string> = {
  today: 'Hoy',
  operations: 'Operaciones',
  areas: 'Áreas',
  'personal-systems': 'Sistemas personales',
  reference: 'Referencia',
  system: 'Sistema',
  private: 'Privado',
  archive: 'Archivo',
};

/**
 * Rutas fijas que resuelven por clave estable (no por slug dinámico).
 * Evita colisión con módulos funcionales (p. ej. /productividad = Sheets).
 */
export const WEB_CATALOG_FIXED_ROUTES = {
  aprendizaje: { stableKey: 'aprendizaje', path: '/aprendizaje' },
  compras: { stableKey: 'compras', path: '/compras' },
} as const;

export type WebCatalogFixedRouteId = keyof typeof WEB_CATALOG_FIXED_ROUTES;

export const WEB_CATALOG_SEARCH_LIMITS = {
  maxQueryLength: 100,
  maxResults: 20,
  maxSnippetLength: 140,
  revalidateSeconds: 60,
} as const;
