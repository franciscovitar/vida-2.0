/**
 * Resúmenes de agenda y preview Hoy a partir de DTO Calendar.
 */
import { addDaysYmd, formatArgentineFullDate } from '@/lib/adapters/dates';
import {
  eventsTouchingDate,
  freeBlocksForDate,
  markOverlaps,
  occupiedMinutesForDate,
  sortEventsForDay,
} from '@/lib/calendar/classify';
import { computeFocusBlock } from '@/lib/calendar/focus';
import { minutesInCalendarTz, parseTimeToMinutes, todayInCalendarTz } from '@/lib/calendar/time';
import { CALENDAR_TIMEZONE } from '@/lib/calendar/constants';
import type {
  CalendarAgendaData,
  CalendarAgendaSummary,
  CalendarAgendaView,
  CalendarDayGroup,
  CalendarEvent,
  CalendarIntegrationStatus,
  CalendarTodayPreview,
  CalendarDataSourceMode,
} from '@/types/calendar';

export function viewRange(view: CalendarAgendaView, today: string): { start: string; end: string } {
  if (view === 'today') return { start: today, end: today };
  if (view === '7') return { start: today, end: addDaysYmd(today, 6) };
  return { start: today, end: addDaysYmd(today, 29) };
}

export function parseAgendaView(raw: string | undefined | null): CalendarAgendaView {
  if (raw === '7' || raw === '30' || raw === 'today') return raw;
  return 'today';
}

function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return dates;
}

export function buildDayGroups(
  events: readonly CalendarEvent[],
  start: string,
  end: string,
): CalendarDayGroup[] {
  const withOverlaps = markOverlaps(events);
  return eachDate(start, end).map((date) => {
    const dayEvents = sortEventsForDay(eventsTouchingDate(withOverlaps, date));
    const occupiedMinutes = occupiedMinutesForDate(dayEvents, date);
    const freeBlocks = freeBlocksForDate(dayEvents, date);
    const conflictCount = dayEvents.filter((event) => event.overlaps).length;
    return {
      date,
      label: formatArgentineFullDate(date),
      events: dayEvents,
      occupiedMinutes,
      freeBlocks,
      conflictCount,
      empty: dayEvents.length === 0,
    };
  });
}

export function buildAgendaSummary(
  events: readonly CalendarEvent[],
  today: string,
  nowMinutes: number,
): CalendarAgendaSummary {
  const todayEvents = sortEventsForDay(eventsTouchingDate(events, today)).filter(
    (event) => event.status !== 'cancelled',
  );
  const timed = todayEvents.filter((event) => !event.allDay && event.startTime && event.endTime);
  const firstEvent = timed[0] ?? todayEvents[0] ?? null;
  const lastEvent =
    timed.length > 0 ? timed[timed.length - 1] : (todayEvents[todayEvents.length - 1] ?? null);
  const nextEvent =
    timed.find(
      (event) =>
        event.blocksTime &&
        event.startTime !== null &&
        parseTimeToMinutes(event.startTime) > nowMinutes,
    ) ?? null;

  return {
    todayEventCount: todayEvents.length,
    occupiedMinutesToday: occupiedMinutesForDate(todayEvents, today),
    firstEvent,
    lastEvent,
    nextEvent,
    freeBlocksToday: freeBlocksForDate(todayEvents, today),
    overlapCountToday: markOverlaps(todayEvents).filter((event) => event.overlaps).length,
    totalEvents: events.filter((event) => event.status !== 'cancelled').length,
  };
}

export function buildAgendaData(input: {
  events: readonly CalendarEvent[];
  view: CalendarAgendaView;
  today: string;
  source: CalendarDataSourceMode;
  status: CalendarIntegrationStatus;
  notice: string | null;
  calendarIds: string[];
  timezone?: string;
  syncedAt?: string;
  now?: Date;
}): CalendarAgendaData {
  const timezone = input.timezone ?? CALENDAR_TIMEZONE;
  const now = input.now ?? new Date();
  const nowMinutes = minutesInCalendarTz(now, timezone);
  const range = viewRange(input.view, input.today);
  const visible = markOverlaps(input.events.filter((event) => event.status !== 'cancelled'));
  const days = buildDayGroups(visible, range.start, range.end);
  const summary = buildAgendaSummary(visible, input.today, nowMinutes);

  return {
    source: input.source,
    status: input.status,
    notice: input.notice,
    timezone,
    view: input.view,
    rangeStart: range.start,
    rangeEnd: range.end,
    targetDate: input.today,
    syncedAt: input.syncedAt ?? now.toISOString(),
    calendarIds: input.calendarIds,
    days,
    summary,
    timelineToday: sortEventsForDay(eventsTouchingDate(visible, input.today)),
  };
}

export function buildCalendarTodayPreview(input: {
  events: readonly CalendarEvent[];
  today: string;
  source: CalendarDataSourceMode;
  status: CalendarIntegrationStatus;
  notice: string | null;
  now?: Date;
  timezone?: string;
}): CalendarTodayPreview {
  const timezone = input.timezone ?? CALENDAR_TIMEZONE;
  const now = input.now ?? new Date();
  const nowMinutes = minutesInCalendarTz(now, timezone);
  const visible = markOverlaps(input.events.filter((event) => event.status !== 'cancelled'));
  const todayEvents = sortEventsForDay(eventsTouchingDate(visible, input.today));
  const focus = computeFocusBlock(todayEvents, input.today, nowMinutes);

  return {
    currentEvent: focus.currentEvent,
    nextEvent: focus.nextEvent,
    todayEvents,
    occupiedMinutes: occupiedMinutesForDate(todayEvents, input.today),
    freeBlocks: freeBlocksForDate(todayEvents, input.today),
    conflicts: todayEvents.filter((event) => event.overlaps),
    source: input.source,
    status: input.status,
    notice: input.notice,
    timezone,
    focus,
  };
}

/**
 * Preview vacío seguro para Hoy cuando Calendar falla o no está configurado.
 * No inyecta eventos mock (evita presentar simulados como reales).
 */
export function emptyCalendarTodayPreview(input?: {
  today?: string;
  source?: CalendarDataSourceMode;
  status?: CalendarIntegrationStatus;
  notice?: string | null;
  timezone?: string;
  now?: Date;
}): CalendarTodayPreview {
  return buildCalendarTodayPreview({
    events: [],
    today: input?.today ?? todayInCalendarTz(),
    source: input?.source ?? 'mock',
    status: input?.status ?? 'mock',
    notice: input?.notice ?? null,
    timezone: input?.timezone,
    now: input?.now,
  });
}

export function emptyAgendaData(
  view: CalendarAgendaView,
  today: string = todayInCalendarTz(),
): CalendarAgendaData {
  return buildAgendaData({
    events: [],
    view,
    today,
    source: 'mock',
    status: 'empty',
    notice: null,
    calendarIds: ['primary'],
  });
}
