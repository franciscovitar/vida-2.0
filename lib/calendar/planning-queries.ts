import 'server-only';

import { calendarLabelFor } from '@/lib/calendar/adapters';
import { listCalendarEvents } from '@/lib/calendar/client';
import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';
import type { CalendarReadCode } from '@/lib/calendar/errors';
import { adaptDailyPlanningCalendarEvent } from '@/lib/calendar/planning-adapters';
import { rangeBoundsRfc3339 } from '@/lib/calendar/time';
import type { DailyPlanningCalendarEvent } from '@/types/daily-planning-intelligence';

export type LoadDailyPlanningCalendarEventsResult =
  | { ok: true; events: DailyPlanningCalendarEvent[] }
  | { ok: false; code: CalendarReadCode };

/**
 * Reader Calendar específico para Daily Planning.
 * Conserva descripción solo dentro del límite server-side para derivar
 * provenance/conflictos; el DTO final nunca expone ese texto crudo.
 */
export async function loadDailyPlanningCalendarEventsInRange(
  config: CalendarOAuthConfig,
  startYmd: string,
  endYmd: string,
): Promise<LoadDailyPlanningCalendarEventsResult> {
  const { timeMin, timeMax } = rangeBoundsRfc3339(startYmd, endYmd);
  const events: DailyPlanningCalendarEvent[] = [];

  for (const [sourceIndex, calendarId] of config.calendarIds.entries()) {
    const result = await listCalendarEvents(config, {
      calendarId,
      timeMin,
      timeMax,
      timeZone: config.timezone,
    });
    if (!result.ok) return result;

    const label = calendarLabelFor(calendarId, sourceIndex);
    for (const raw of result.events) {
      const event = adaptDailyPlanningCalendarEvent(raw, calendarId, config.timezone, label);
      if (event) events.push(event);
    }
  }

  return { ok: true, events };
}
