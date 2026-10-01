import type { DailyFocus, SyncState } from '@/types';

/** Fecha de referencia de la vista Hoy con datos simulados. */
export const referenceDate = new Date('2026-07-20T09:00:00');

/** Prioridades del día. */
export const dailyFocus: DailyFocus = {
  primary: 'Terminar y entregar el TP de Sistemas Operativos',
  secondary: [
    'Revisar el pull request pendiente de Genova',
    'Cerrar el esquema de datos de Vida 2.0',
  ],
};

/** Estado de sincronización simulado con las fuentes futuras. */
export const syncState: SyncState = {
  lastSyncedAt: '2026-07-20T08:45:00',
  sources: [
    { id: 'sheets', label: 'Google Sheets', ok: true },
    { id: 'notion', label: 'Notion', ok: true },
    { id: 'calendar', label: 'Google Calendar', ok: true },
  ],
};
