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

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asDateField(value: unknown): GoogleCalendarEventRaw['start'] {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    date: asOptionalString(record.date),
    dateTime: asOptionalString(record.dateTime),
    timeZone: asOptionalString(record.timeZone),
  };
}

/**
 * Copia explícita de un ítem events.list a un objeto plano nuevo.
 * Nunca retiene response.data ni prototipos del SDK.
 */
export function toPlainGoogleEvent(value: unknown): GoogleCalendarEventRaw | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    id: asOptionalString(record.id),
    summary: asOptionalString(record.summary),
    status: asOptionalString(record.status),
    transparency: asOptionalString(record.transparency),
    location: asOptionalString(record.location),
    recurringEventId: asOptionalString(record.recurringEventId),
    start: asDateField(record.start),
    end: asDateField(record.end),
  };
}

/**
 * DTO CalendarEvent como objeto nuevo 100 % JSON-plano.
 */
export function toPlainCalendarEvent(event: CalendarEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    calendarLabel: event.calendarLabel,
    location: event.location,
    status: event.status,
    transparency: event.transparency,
    blocksTime: event.blocksTime,
    allDay: event.allDay,
    multiDay: event.multiDay,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    durationMinutes: event.durationMinutes,
    recurring: event.recurring,
    overlaps: event.overlaps,
  };
}

export function calendarLabelFor(calendarId: string, sourceIndex = 0): string {
  if (calendarId === 'primary') return 'Principal';
  return `Calendario ${sourceIndex + 1}`;
}

/**
 * Convierte IDs del proveedor y datos del evento en una clave opaca para la UI.
 * No es una firma de seguridad: evita que IDs/correos internos crucen el DTO.
 */
export function opaqueCalendarEventId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `calendar-event-${(hash >>> 0).toString(36)}`;
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
  publicCalendarLabel = calendarLabelFor(calendarId),
): CalendarEvent | null {
  const time = adaptEventTime(raw, timeZone);
  if (!time) return null;

  const status = adaptStatus(raw.status);
  const transparency = adaptTransparency(raw.transparency);
  const blocksTime = status !== 'cancelled' && transparency === 'opaque';

  return toPlainCalendarEvent({
    id: opaqueCalendarEventId(
      `${calendarId}:${raw.id ?? ''}:${time.startDate}:${time.startTime ?? 'allday'}:${raw.summary ?? ''}`,
    ),
    title: (raw.summary ?? '').trim() || 'Sin título',
    calendarLabel: publicCalendarLabel,
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
  });
}

/** Excluye cancelados del conjunto visible. */
export function filterVisibleEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return events.filter((event) => event.status !== 'cancelled').map(toPlainCalendarEvent);
}
