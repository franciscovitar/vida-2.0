/**
 * Cliente Google Calendar: únicamente events.list (solo servidor).
 */
import 'server-only';

import { google } from 'googleapis';

import { createCalendarOAuthClient } from '@/lib/calendar/auth';
import type { CalendarOAuthConfig } from '@/lib/calendar/config';
import { mapCalendarFailure, type CalendarReadCode } from '@/lib/calendar/errors';
import type { GoogleCalendarEventRaw } from '@/lib/calendar/adapters';

export interface CalendarListParams {
  calendarId: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}

export type CalendarListResult =
  { ok: true; events: GoogleCalendarEventRaw[] } | { ok: false; code: CalendarReadCode };

/**
 * Lista eventos de un calendario autorizado.
 * singleEvents=true, orderBy=startTime, con paginación.
 * Solo lectura vía events.list. Sin mutaciones ni APIs auxiliares de escritura.
 */
export async function listCalendarEvents(
  config: CalendarOAuthConfig,
  params: CalendarListParams,
): Promise<CalendarListResult> {
  if (!config.calendarIds.includes(params.calendarId)) {
    return { ok: false, code: 'invalid-calendar-id' };
  }

  try {
    const auth = createCalendarOAuthClient(config);
    const calendar = google.calendar({ version: 'v3', auth });
    const events: GoogleCalendarEventRaw[] = [];
    let pageToken: string | undefined;

    do {
      const response = await calendar.events.list({
        calendarId: params.calendarId,
        timeMin: params.timeMin,
        timeMax: params.timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: params.timeZone,
        pageToken,
        maxResults: 100,
      });

      const items = response.data.items ?? [];
      for (const item of items) {
        events.push({
          id: item.id,
          summary: item.summary,
          status: item.status,
          transparency: item.transparency,
          location: item.location,
          recurringEventId: item.recurringEventId,
          start: item.start
            ? {
                date: item.start.date,
                dateTime: item.start.dateTime,
                timeZone: item.start.timeZone,
              }
            : null,
          end: item.end
            ? {
                date: item.end.date,
                dateTime: item.end.dateTime,
                timeZone: item.end.timeZone,
              }
            : null,
        });
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return { ok: true, events };
  } catch (error) {
    return { ok: false, code: mapCalendarFailure(error) };
  }
}
