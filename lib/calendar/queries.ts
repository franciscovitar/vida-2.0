/**
 * Consultas Calendar: orquesta events.list por IDs autorizados.
 */
import 'server-only';

import { adaptCalendarEvent, filterVisibleEvents } from '@/lib/calendar/adapters';
import { listCalendarEvents } from '@/lib/calendar/client';
import type { CalendarOAuthConfig } from '@/lib/calendar/config';
import type { CalendarReadCode } from '@/lib/calendar/errors';
import { rangeBoundsRfc3339 } from '@/lib/calendar/time';
import type { CalendarEvent } from '@/types/calendar';

export type LoadCalendarEventsResult =
  { ok: true; events: CalendarEvent[] } | { ok: false; code: CalendarReadCode };

/**
 * Carga eventos solo en el rango [startYmd, endYmd] inclusive.
 * Consulta exclusivamente los calendarIds del config (sin descubrimiento).
 */
export async function loadCalendarEventsInRange(
  config: CalendarOAuthConfig,
  startYmd: string,
  endYmd: string,
): Promise<LoadCalendarEventsResult> {
  const { timeMin, timeMax } = rangeBoundsRfc3339(startYmd, endYmd);
  const collected: CalendarEvent[] = [];

  for (const calendarId of config.calendarIds) {
    const result = await listCalendarEvents(config, {
      calendarId,
      timeMin,
      timeMax,
      timeZone: config.timezone,
    });
    if (!result.ok) return result;

    for (const raw of result.events) {
      const adapted = adaptCalendarEvent(raw, calendarId, config.timezone);
      if (adapted) collected.push(adapted);
    }
  }

  return { ok: true, events: filterVisibleEvents(collected) };
}
