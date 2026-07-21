/**
 * Consultas Calendar: orquesta events.list por IDs autorizados.
 */
import 'server-only';

import {
  adaptCalendarEvent,
  filterVisibleEvents,
  toPlainCalendarEvent,
} from '@/lib/calendar/adapters';
import { listCalendarEvents } from '@/lib/calendar/client';
import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';
import type { CalendarReadCode } from '@/lib/calendar/errors';
import { rangeBoundsRfc3339 } from '@/lib/calendar/time';
import { traceCalendarStage } from '@/lib/calendar/trace';
import type { CalendarEvent } from '@/types/calendar';

export type LoadCalendarEventsResult =
  { ok: true; events: CalendarEvent[] } | { ok: false; code: CalendarReadCode };

/**
 * Carga eventos solo en el rango [startYmd, endYmd] inclusive.
 * Consulta exclusivamente los calendarIds del config (sin descubrimiento).
 * Resultado: solo DTO planos (sin SDK).
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
    if (!result.ok) return { ok: false, code: result.code };

    for (const raw of result.events) {
      const adapted = adaptCalendarEvent(raw, calendarId, config.timezone);
      if (adapted) collected.push(toPlainCalendarEvent(adapted));
    }
  }

  traceCalendarStage(6);
  const events = filterVisibleEvents(collected).map(toPlainCalendarEvent);
  return { ok: true, events };
}
