/**
 * Renovación de access token OAuth (refresh_token) vía fetch.
 * Sin googleapis / gaxios / OAuth2Client.
 */
import 'server-only';

import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';
import type { CalendarReadCode } from '@/lib/calendar/errors';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type CalendarAccessTokenResult =
  { ok: true; token: string } | { ok: false; code: CalendarReadCode };

/**
 * Obtiene un access token de corta vida a partir del refresh token.
 * Nunca registra ni devuelve el refresh token.
 */
export async function fetchCalendarAccessToken(
  config: Pick<CalendarOAuthConfig, 'clientId' | 'clientSecret' | 'refreshToken'>,
): Promise<CalendarAccessTokenResult> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
      }),
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
    void bodyText;
    if (response.status === 401 || response.status === 400) {
      return { ok: false, code: 'auth-error' };
    }
    if (response.status === 403) return { ok: false, code: 'permission-error' };
    if (response.status === 429) return { ok: false, code: 'rate-limited' };
    return { ok: false, code: 'auth-error' };
  }

  try {
    const parsed = JSON.parse(bodyText) as { access_token?: unknown };
    if (typeof parsed.access_token !== 'string' || parsed.access_token.length === 0) {
      return { ok: false, code: 'auth-error' };
    }
    return { ok: true, token: parsed.access_token };
  } catch {
    return { ok: false, code: 'auth-error' };
  }
}
