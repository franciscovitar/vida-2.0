/**
 * Fuente de datos Notion para páginas (mock | notion con fallback seguro).
 * Independiente de Google Sheets.
 */
import 'server-only';

import { loadNotionDashboard, loadNotionHoyPreview } from '@/lib/notion/dashboard';
import { buildNotionHoyPreview } from '@/lib/notion/summaries';

/** Cache por request: una carga para /tareas, /proyectos y Hoy. */
export const getNotionDashboard = loadNotionDashboard;

/** Contrato de preview Hoy (misma carga cacheada). */
export async function getNotionHoyPreview() {
  return loadNotionHoyPreview();
}

export { buildNotionHoyPreview };
