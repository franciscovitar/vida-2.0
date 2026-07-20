import type { DailyFocus, InboxItem, SyncState } from '@/types';

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

/** Ítems iniciales de la bandeja de entrada (captura rápida). */
export const inboxSeed: InboxItem[] = [
  {
    id: 'inbox-1',
    text: 'Idea: dashboard de gastos mensuales',
    createdAt: '2026-07-20T08:10:00',
    pendingSync: true,
  },
  {
    id: 'inbox-2',
    text: 'Pedir turno con el kinesiólogo',
    createdAt: '2026-07-19T21:30:00',
    pendingSync: true,
  },
];
