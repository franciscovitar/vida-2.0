/**
 * Adaptación de eventos Google Calendar → DTO planos.
 */
import { addDaysYmd } from '@/lib/adapters/dates';
import { exclusiveEndToInclusive, zonedDateTimeParts } from '@/lib/calendar/time';
import { CALENDAR_TIMEZONE } from '@/lib/calendar/constants';
import type {
  CalendarEvent,
  CalendarEventStatus,
  CalendarEventTime,
  CalendarTransparency,
} from '@/types/calendar';

/** Forma mínima de un ítem events.list (sin tipar el SDK completo). */
export interface GoogleCalendarEventRaw {
  id?: string | null;
  summary?: string | null;
  status?: string | null;
  transparency?: string | null;
  location?: string | null;
  recurringEventId?: string | null;
  start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
}

export function calendarLabelFor(calendarId: string): string | null {
  if (calendarId === 'primary') return 'Principal';
  return null;
}

export function adaptEventTime(
  raw: GoogleCalendarEventRaw,
  timeZone = CALENDAR_TIMEZONE,
): CalendarEventTime | null {
  const start = raw.start;
  const end = raw.end;
  if (!start) return null;

  if (start.date) {
    const startDate = start.date;
    const endExclusive = end?.date ?? addDaysYmd(startDate, 1);
    const endDate = exclusiveEndToInclusive(endExclusive, addDaysYmd);
    const multiDay = startDate !== endDate;
    return {
      allDay: true,
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      startTime: null,
      endTime: null,
      durationMinutes: null,
      multiDay,
    };
  }

  if (!start.dateTime || !end?.dateTime) return null;

  const startParts = zonedDateTimeParts(start.dateTime, timeZone);
  const endParts = zonedDateTimeParts(end.dateTime, timeZone);
  let duration = endParts.minutes - startParts.minutes;
  if (endParts.date > startParts.date) {
    // Cruza medianoche: minutos hasta fin del día + del día siguiente.
    duration = 24 * 60 - startParts.minutes + endParts.minutes;
  }
  if (duration < 0) duration = 0;

  return {
    allDay: false,
    startDate: startParts.date,
    endDate: endParts.date,
    startTime: startParts.time,
    endTime: endParts.time,
    durationMinutes: duration,
    multiDay: startParts.date !== endParts.date,
  };
}

function adaptStatus(raw: string | null | undefined): CalendarEventStatus {
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'tentative') return 'tentative';
  return 'confirmed';
}

function adaptTransparency(raw: string | null | undefined): CalendarTransparency {
  return raw === 'transparent' ? 'transparent' : 'opaque';
}

export function adaptCalendarEvent(
  raw: GoogleCalendarEventRaw,
  calendarId: string,
  timeZone = CALENDAR_TIMEZONE,
): CalendarEvent | null {
  const time = adaptEventTime(raw, timeZone);
  if (!time) return null;

  const status = adaptStatus(raw.status);
  const transparency = adaptTransparency(raw.transparency);
  const blocksTime = status !== 'cancelled' && transparency === 'opaque';

  return {
    id:
      raw.id ??
      `${calendarId}:${time.startDate}:${time.startTime ?? 'allday'}:${raw.summary ?? ''}`,
    title: (raw.summary ?? '').trim() || 'Sin título',
    calendarId,
    calendarLabel: calendarLabelFor(calendarId),
    location: raw.location?.trim() ? raw.location.trim() : null,
    status,
    transparency,
    blocksTime,
    allDay: time.allDay,
    multiDay: time.multiDay,
    startDate: time.startDate,
    endDate: time.endDate,
    startTime: time.startTime,
    endTime: time.endTime,
    durationMinutes: time.durationMinutes,
    recurring: Boolean(raw.recurringEventId),
    overlaps: false,
  };
}

/** Excluye cancelados del conjunto visible. */
export function filterVisibleEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return events.filter((event) => event.status !== 'cancelled');
}
