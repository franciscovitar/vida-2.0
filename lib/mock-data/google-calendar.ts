/**
 * Eventos simulados coherentes con Vida 2.0 (no hardcodear en page.tsx).
 */
import { addDaysYmd } from '@/lib/adapters/dates';
import { adaptCalendarEvent, type GoogleCalendarEventRaw } from '@/lib/calendar/adapters';
import type { CalendarEvent } from '@/types/calendar';

function timed(
  id: string,
  title: string,
  date: string,
  start: string,
  end: string,
  extras?: Partial<GoogleCalendarEventRaw>,
): GoogleCalendarEventRaw {
  return {
    id,
    summary: title,
    status: 'confirmed',
    transparency: 'opaque',
    start: { dateTime: `${date}T${start}:00-03:00` },
    end: { dateTime: `${date}T${end}:00-03:00` },
    ...extras,
  };
}

function allDay(
  id: string,
  title: string,
  startDate: string,
  endExclusive: string,
  extras?: Partial<GoogleCalendarEventRaw>,
): GoogleCalendarEventRaw {
  return {
    id,
    summary: title,
    status: 'confirmed',
    transparency: 'opaque',
    start: { date: startDate },
    end: { date: endExclusive },
    ...extras,
  };
}

/** Raw mocks + adaptación (incluye cancelado para pruebas de exclusión). */
export function buildMockCalendarRawEvents(today: string): GoogleCalendarEventRaw[] {
  const d1 = addDaysYmd(today, 1);
  const d2 = addDaysYmd(today, 2);
  // today+3 queda vacío a propósito (el multi-día termina inclusivo en today+2).
  const d5 = addDaysYmd(today, 5);
  const multiStart = addDaysYmd(today, 1);
  const multiEndExclusive = addDaysYmd(today, 3);

  return [
    timed('mock-cal-daily', 'Daily de Genova', today, '09:30', '09:45', {
      location: 'Meet',
    }),
    timed('mock-cal-study', 'Bloque de estudio: TP SO', today, '10:00', '12:00', {
      location: 'Biblioteca',
    }),
    // Superpuesto con el bloque de estudio (parcial).
    timed('mock-cal-overlap', 'Tutoría Facultad', today, '11:00', '11:45', {
      location: 'Aula 210',
    }),
    timed('mock-cal-genova', 'Desarrollo Genova', today, '14:00', '17:00'),
    timed('mock-cal-class', 'Clase: Sistemas Operativos', today, '18:30', '21:30', {
      location: 'Aula 302',
    }),
    timed('mock-cal-gym', 'Gimnasio', today, '22:00', '23:00'),
    timed('mock-cal-transparent', 'Recordatorio personal (no bloquea)', today, '16:00', '16:15', {
      transparency: 'transparent',
    }),
    timed('mock-cal-cancelled', 'Reunión cancelada', today, '08:00', '08:30', {
      status: 'cancelled',
    }),
    allDay('mock-cal-allday', 'Entrega administrativa Facultad', today, d1),
    timed('mock-cal-futbol', 'Fútbol', d1, '20:00', '21:30', { location: 'Cancha 3' }),
    timed('mock-cal-genova-2', 'Sprint planning Genova', d2, '10:00', '11:00'),
    allDay('mock-cal-multiday', 'Viaje / disponibilidad reducida', multiStart, multiEndExclusive),
    timed('mock-cal-recurring', 'Standup expandido', d5, '09:00', '09:15', {
      recurringEventId: 'series-standup',
    }),
  ];
}

export function buildMockCalendarEvents(today: string, calendarId = 'primary'): CalendarEvent[] {
  return buildMockCalendarRawEvents(today)
    .map((raw) => adaptCalendarEvent(raw, calendarId))
    .filter((event): event is CalendarEvent => event !== null);
}
