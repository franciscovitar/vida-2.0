/**
 * Cálculo determinístico de foco / bloque actual (sin IA).
 *
 * Regla: eventos de día completo no bloquean las 24 h; no fijan
 * `currentEvent` ni restan del próximo bloque libre timed.
 */
import {
  blockingTimedOnDate,
  eventIntervalOnDate,
  freeBlocksForDate,
  mergeIntervals,
} from '@/lib/calendar/classify';
import { parseTimeToMinutes } from '@/lib/calendar/time';
import type {
  CalendarEvent,
  CalendarEventBrief,
  CalendarFocusBlock,
  CalendarFreeBlock,
} from '@/types/calendar';

function toBrief(event: CalendarEvent): CalendarEventBrief {
  return {
    id: event.id,
    title: event.title,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
    location: event.location,
  };
}

function remainingFreeMinutesFrom(
  freeBlocks: readonly CalendarFreeBlock[],
  nowMinutes: number,
): number {
  let total = 0;
  for (const block of freeBlocks) {
    const start = parseTimeToMinutes(block.startTime);
    const end = parseTimeToMinutes(block.endTime);
    if (end <= nowMinutes) continue;
    const clippedStart = Math.max(start, nowMinutes);
    if (end > clippedStart) total += end - clippedStart;
  }
  return total;
}

export function computeFocusBlock(
  events: readonly CalendarEvent[],
  date: string,
  nowMinutes: number,
): CalendarFocusBlock {
  const timed = blockingTimedOnDate(events, date);
  const freeBlocks = freeBlocksForDate(events, date);
  const remainingFreeMinutes = remainingFreeMinutesFrom(freeBlocks, nowMinutes);

  if (timed.length === 0) {
    const nextFree = freeBlocks[0] ?? null;
    return {
      currentEvent: null,
      nextEvent: null,
      minutesUntilNext: null,
      minutesRemaining: null,
      nextFreeBlock: nextFree,
      freeBlockDurationMinutes: nextFree?.durationMinutes ?? null,
      remainingFreeMinutes,
      status: 'empty-day',
    };
  }

  let current: CalendarEvent | null = null;
  let next: CalendarEvent | null = null;

  for (const event of timed) {
    const interval = eventIntervalOnDate(event, date);
    if (!interval) continue;
    if (interval.start <= nowMinutes && nowMinutes < interval.end) {
      if (!current || interval.start > parseTimeToMinutes(current.startTime ?? '00:00')) {
        current = event;
      }
    } else if (interval.start > nowMinutes) {
      if (!next || interval.start < parseTimeToMinutes(next.startTime ?? '99:99')) {
        next = event;
      }
    }
  }

  const nextFree =
    freeBlocks.find(
      (block) =>
        parseTimeToMinutes(block.endTime) > nowMinutes &&
        parseTimeToMinutes(block.startTime) >= nowMinutes,
    ) ??
    freeBlocks.find((block) => parseTimeToMinutes(block.endTime) > nowMinutes) ??
    null;

  // Si estamos dentro de un evento, el próximo hueco es el que empieza al terminar el bloque ocupado actual.
  let resolvedFree: CalendarFreeBlock | null = nextFree;
  if (current) {
    const busy = mergeIntervals(
      timed
        .map((event) => eventIntervalOnDate(event, date))
        .filter((value): value is { start: number; end: number } => value !== null),
    );
    const covering = busy.find(
      (interval) => interval.start <= nowMinutes && nowMinutes < interval.end,
    );
    if (covering) {
      resolvedFree =
        freeBlocks.find((block) => parseTimeToMinutes(block.startTime) >= covering.end) ?? null;
    }
  }

  let status: CalendarFocusBlock['status'] = 'free';
  if (current) status = 'in-event';
  else if (next) status = 'between-events';
  else if (timed.length === 0) status = 'empty-day';

  let minutesRemaining: number | null = null;
  if (current?.endTime) {
    minutesRemaining = Math.max(0, parseTimeToMinutes(current.endTime) - nowMinutes);
  }

  return {
    currentEvent: current ? toBrief(current) : null,
    nextEvent: next ? toBrief(next) : null,
    minutesUntilNext: next?.startTime
      ? Math.max(0, parseTimeToMinutes(next.startTime) - nowMinutes)
      : null,
    minutesRemaining,
    nextFreeBlock: resolvedFree,
    freeBlockDurationMinutes: resolvedFree?.durationMinutes ?? null,
    remainingFreeMinutes,
    status,
  };
}
