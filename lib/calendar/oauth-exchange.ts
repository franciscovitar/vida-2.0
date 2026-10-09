/**
 * Intercambio del code OAuth por tokens (solo servidor, fetch).
 * Nunca registra ni devuelve tokens ni la respuesta cruda.
 */
import 'server-only';

import type { CalendarOAuthSetupConfig } from '@/lib/calendar/config-resolve';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=kind';

export type ExchangeCodeResult =
  | { ok: true }
  | { ok: false; reason: 'no-refresh-token' | 'exchange-error' | 'calendar-read-error' };

/**
 * Intercambia el authorization code y descarta tokens dentro del módulo servidor.
 */
export async function exchangeCalendarAuthorizationCode(
  setup: CalendarOAuthSetupConfig,
  code: string,
): Promise<ExchangeCodeResult> {
  try {
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: setup.clientId,
          client_secret: setup.clientSecret,
          redirect_uri: setup.redirectUri,
          grant_type: 'authorization_code',
        }),
        cache: 'no-store',
      });
    } catch {
      return { ok: false, reason: 'exchange-error' };
    }

    const bodyText = await response.text();
    if (!response.ok) return { ok: false, reason: 'exchange-error' };

    let parsed: { refresh_token?: unknown; access_token?: unknown };
    try {
      parsed = JSON.parse(bodyText) as { refresh_token?: unknown };
    } catch {
      return { ok: false, reason: 'exchange-error' };
    }

    const refreshToken =
      typeof parsed.refresh_token === 'string' ? parsed.refresh_token.trim() : '';
    if (!refreshToken) return { ok: false, reason: 'no-refresh-token' };

    const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token.trim() : '';
    if (!accessToken) return { ok: false, reason: 'exchange-error' };

    let calendarResponse: Response;
    try {
      calendarResponse = await fetch(CALENDAR_EVENTS_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, reason: 'calendar-read-error' };
    }
    try {
      await calendarResponse.body?.cancel();
    } catch {
      // The response body is intentionally discarded; status alone proves the read gate.
    }
    if (!calendarResponse.ok) return { ok: false, reason: 'calendar-read-error' };

    return { ok: true };
  } catch {
    return { ok: false, reason: 'exchange-error' };
  }
}
