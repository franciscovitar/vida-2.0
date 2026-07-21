/**
 * Cliente Google Calendar Node-only: events.list vía REST + fetch.
 * Sin SDK de Google Calendar ni respuestas crudas no serializables.
 */
import 'server-only';

import type { GoogleCalendarEventRaw } from '@/lib/calendar/adapters';
import { toPlainGoogleEvent } from '@/lib/calendar/adapters';
import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';
import { mapCalendarHttpStatus, type CalendarReadCode } from '@/lib/calendar/errors';
import { fetchCalendarAccessToken } from '@/lib/calendar/token';
import { traceCalendarStage } from '@/lib/calendar/trace';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarListParams {
  calendarId: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}

export type CalendarListResult =
  { ok: true; events: GoogleCalendarEventRaw[] } | { ok: false; code: CalendarReadCode };

interface CalendarEventsListJson {
  items?: unknown[];
  nextPageToken?: unknown;
}

/**
 * Lista eventos de un calendario autorizado (equivalente REST a events.list).
 * singleEvents=true, orderBy=startTime, con paginación.
 */
export async function listCalendarEvents(
  config: CalendarOAuthConfig,
  params: CalendarListParams,
): Promise<CalendarListResult> {
  if (!config.calendarIds.includes(params.calendarId)) {
    return { ok: false, code: 'invalid-calendar-id' };
  }

  try {
    traceCalendarStage(1);
    const tokenResult = await fetchCalendarAccessToken(config);
    if (!tokenResult.ok) return tokenResult;
    traceCalendarStage(3);

    const events: GoogleCalendarEventRaw[] = [];
    let pageToken: string | undefined;
    traceCalendarStage(4);

    do {
      const url = new URL(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(params.calendarId)}/events`,
      );
      url.searchParams.set('timeMin', params.timeMin);
      url.searchParams.set('timeMax', params.timeMax);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('timeZone', params.timeZone);
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${tokenResult.token}` },
          cache: 'no-store',
        });
      } catch {
        return { ok: false, code: 'network-error' };
      }

      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        return { ok: false, code: 'network-error' };
      }

      if (!response.ok) {
        return { ok: false, code: mapCalendarHttpStatus(response.status, bodyText) };
      }

      let parsed: CalendarEventsListJson;
      try {
        parsed = JSON.parse(bodyText) as CalendarEventsListJson;
      } catch {
        return { ok: false, code: 'read-error' };
      }

      const items = Array.isArray(parsed.items) ? parsed.items : [];
      for (const item of items) {
        const plain = toPlainGoogleEvent(item);
        if (plain) events.push(plain);
      }

      pageToken =
        typeof parsed.nextPageToken === 'string' && parsed.nextPageToken.length > 0
          ? parsed.nextPageToken
          : undefined;
    } while (pageToken);

    traceCalendarStage(5);
    return { ok: true, events };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}
