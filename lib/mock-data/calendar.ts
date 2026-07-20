import type { CalendarEvent } from '@/types';

/** Eventos y bloques de tiempo simulados para hoy. */
export const todayEvents: CalendarEvent[] = [
  { id: 'ev-1', title: 'Daily de Genova', category: 'work', start: '09:30', end: '09:45' },
  {
    id: 'ev-2',
    title: 'Bloque de foco: TP SO',
    category: 'university',
    start: '10:00',
    end: '12:00',
  },
  { id: 'ev-3', title: 'Almuerzo', category: 'personal', start: '13:00', end: '13:45' },
  { id: 'ev-4', title: 'Desarrollo Genova', category: 'work', start: '14:00', end: '17:00' },
  {
    id: 'ev-5',
    title: 'Clase: Sistemas Operativos',
    category: 'university',
    start: '18:30',
    end: '21:30',
    location: 'Aula 302',
  },
  { id: 'ev-6', title: 'Gimnasio', category: 'personal', start: '22:00', end: '23:00' },
];
