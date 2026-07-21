/**
 * Fuente de datos Notion para páginas (mock | notion con fallback seguro).
 * Independiente de Google Sheets. Requiere sesión Auth autorizada.
 */
import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadNotionDashboard, loadNotionHoyPreview } from '@/lib/notion/dashboard';
import { buildNotionHoyPreview } from '@/lib/notion/summaries';

/** Una carga protegida para /tareas y /proyectos. */
export async function getNotionDashboard() {
  await requireAuthorizedSession();
  return loadNotionDashboard();
}

/** Contrato de preview Hoy (misma carga cacheada, con sesión). */
export async function getNotionHoyPreview() {
  await requireAuthorizedSession();
  return loadNotionHoyPreview();
}

export { buildNotionHoyPreview };
