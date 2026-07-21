/**
 * Clasificación de solapes, minutos ocupados y huecos libres.
 *
 * Regla documentada — día completo:
 * Un evento all-day NO bloquea automáticamente las 24 h ni suma a
 * `occupiedMinutes`. Solo se muestra en la agenda como “Día completo”.
 */
import { FREE_BLOCK_DAY_END_MINUTES, FREE_BLOCK_DAY_START_MINUTES } from '@/lib/calendar/constants';
import { formatMinutesAsTime, parseTimeToMinutes } from '@/lib/calendar/time';
import type { CalendarEvent, CalendarFreeBlock } from '@/types/calendar';

export interface MinuteInterval {
  start: number;
  end: number;
}

/** Eventos timed que bloquean tiempo y tocan la fecha civil. */
export function blockingTimedOnDate(
  events: readonly CalendarEvent[],
  date: string,
): CalendarEvent[] {
  return events.filter(
    (event) =>
      event.blocksTime &&
      !event.allDay &&
      event.startTime !== null &&
      event.endTime !== null &&
      event.startDate <= date &&
      event.endDate >= date,
  );
}

export function eventIntervalOnDate(event: CalendarEvent, date: string): MinuteInterval | null {
  if (event.allDay || !event.startTime || !event.endTime) return null;
  if (event.startDate > date || event.endDate < date) return null;

  let start = parseTimeToMinutes(event.startTime);
  let end = parseTimeToMinutes(event.endTime);

  if (event.startDate < date) start = 0;
  if (event.endDate > date) end = 24 * 60;
  if (end <= start) return null;
  return { start, end };
}

export function mergeIntervals(intervals: readonly MinuteInterval[]): MinuteInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MinuteInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start < last.end) {
      last.end = Math.max(last.end, current.end);
    } else if (current.start === last.end) {
      last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Minutos ocupados únicos (solapes no se cuentan dos veces). */
export function occupiedMinutesForDate(events: readonly CalendarEvent[], date: string): number {
  const intervals = blockingTimedOnDate(events, date)
    .map((event) => eventIntervalOnDate(event, date))
    .filter((value): value is MinuteInterval => value !== null);
  return mergeIntervals(intervals).reduce(
    (sum, interval) => sum + (interval.end - interval.start),
    0,
  );
}

export function freeBlocksForDate(
  events: readonly CalendarEvent[],
  date: string,
  windowStart = FREE_BLOCK_DAY_START_MINUTES,
  windowEnd = FREE_BLOCK_DAY_END_MINUTES,
): CalendarFreeBlock[] {
  const intervals = mergeIntervals(
    blockingTimedOnDate(events, date)
      .map((event) => eventIntervalOnDate(event, date))
      .filter((value): value is MinuteInterval => value !== null)
      .map((interval) => ({
        start: Math.max(interval.start, windowStart),
        end: Math.min(interval.end, windowEnd),
      }))
      .filter((interval) => interval.end > interval.start),
  );

  const gaps: CalendarFreeBlock[] = [];
  let cursor = windowStart;
  for (const interval of intervals) {
    if (interval.start > cursor) {
      gaps.push({
        date,
        startTime: formatMinutesAsTime(cursor),
        endTime: formatMinutesAsTime(interval.start),
        durationMinutes: interval.start - cursor,
      });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < windowEnd) {
    gaps.push({
      date,
      startTime: formatMinutesAsTime(cursor),
      endTime: formatMinutesAsTime(windowEnd),
      durationMinutes: windowEnd - cursor,
    });
  }
  return gaps;
}

/** Marca overlaps en eventos timed que bloquean tiempo. */
export function markOverlaps(events: readonly CalendarEvent[]): CalendarEvent[] {
  const result = events.map((event) => ({ ...event, overlaps: false }));

  for (let i = 0; i < result.length; i += 1) {
    const a = result[i];
    if (!a.blocksTime || a.allDay || !a.startTime || !a.endTime) continue;
    for (let j = i + 1; j < result.length; j += 1) {
      const b = result[j];
      if (!b.blocksTime || b.allDay || !b.startTime || !b.endTime) continue;
      if (a.endDate < b.startDate || b.endDate < a.startDate) continue;

      // Comparación en el día de inicio de a (suficiente para mocks y listados diarios).
      const date = a.startDate < b.startDate ? b.startDate : a.startDate;
      const ia = eventIntervalOnDate(a, date);
      const ib = eventIntervalOnDate(b, date);
      if (!ia || !ib) continue;
      if (ia.start < ib.end && ib.start < ia.end) {
        result[i] = { ...result[i], overlaps: true };
        result[j] = { ...result[j], overlaps: true };
      }
    }
  }

  return result;
}

export function eventsTouchingDate(
  events: readonly CalendarEvent[],
  date: string,
): CalendarEvent[] {
  return events.filter((event) => event.startDate <= date && event.endDate >= date);
}

export function sortEventsForDay(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const aStart = a.startTime ?? '00:00';
    const bStart = b.startTime ?? '00:00';
    if (aStart !== bStart) return aStart.localeCompare(bStart);
    return a.title.localeCompare(b.title, 'es');
  });
}
