/**
 * Intercambio del code OAuth por tokens (solo servidor, fetch).
 * Nunca registra ni devuelve access_token, id_token ni la respuesta cruda.
 */
import 'server-only';

import type { CalendarOAuthSetupConfig } from '@/lib/calendar/config-resolve';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type ExchangeCodeResult =
  { ok: true; refreshToken: string } | { ok: false; reason: 'no-refresh-token' | 'exchange-error' };

/**
 * Intercambia el authorization code. Solo expone refresh_token si existe.
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

    let parsed: { refresh_token?: unknown };
    try {
      parsed = JSON.parse(bodyText) as { refresh_token?: unknown };
    } catch {
      return { ok: false, reason: 'exchange-error' };
    }

    const refreshToken =
      typeof parsed.refresh_token === 'string' ? parsed.refresh_token.trim() : '';
    if (!refreshToken) return { ok: false, reason: 'no-refresh-token' };
    return { ok: true, refreshToken };
  } catch {
    return { ok: false, reason: 'exchange-error' };
  }
}
