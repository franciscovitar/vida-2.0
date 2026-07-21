import type { WebCatalogEntry } from '@/types/web-catalog';

/** Puerto de solo lectura para una futura fuente del Registro Web. */
export interface WebCatalogRepository {
  list(): Promise<readonly WebCatalogEntry[]>;
  getByStableKey(stableKey: string): Promise<WebCatalogEntry | null>;
}
