/**
 * Autenticación OAuth 2.0 para Google Calendar (lectura + flujo local 5B).
 *
 * La lectura real usa fetch Node-only (`token.ts` + `client.ts`), sin googleapis.
 * El intercambio del code (5B) también usa fetch (`oauth-exchange.ts`).
 */
import 'server-only';

import { CALENDAR_READONLY_SCOPE } from '@/lib/calendar/constants';
import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';
import { buildCalendarConsentUrl } from '@/lib/calendar/oauth-flow';

export { CALENDAR_READONLY_SCOPE };

/**
 * @deprecated Preferí `buildCalendarConsentUrl` en el flujo 5B (incluye state).
 * Conservado como referencia del scope único.
 */
export function buildConsentUrlPreview(
  config: Pick<CalendarOAuthConfig, 'clientId' | 'clientSecret'>,
  redirectUri: string,
  state = 'preview',
): string {
  void config.clientSecret;
  return buildCalendarConsentUrl({
    clientId: config.clientId,
    redirectUri,
    state,
  });
}
