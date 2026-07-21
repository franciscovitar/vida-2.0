/**
 * Etiqueta discreta del estado de integración (sidebar).
 */
import type { DataSourceKind, TodayStatus } from '@/types';

/** Texto del pie de la barra lateral según origen y estado. */
export function integrationSidebarLabel(source: DataSourceKind, status: TodayStatus): string {
  if (source === 'mock' || status === 'mock') return 'Datos simulados';
  if (status === 'not-configured') return 'Sin conexión';
  if (status === 'ready' || status === 'no-data') return 'Google Sheets';
  return 'Integración parcial';
}
