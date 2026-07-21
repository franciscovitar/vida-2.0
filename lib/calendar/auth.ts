/**
 * Autenticación OAuth 2.0 para Google Calendar (preparada, sin consentimiento UI).
 *
 * ## Fase 5B — proceso manual previsto (un único usuario)
 *
 * 1. En Google Cloud Console, crear (o reutilizar) un proyecto y habilitar
 *    **Google Calendar API**.
 * 2. Crear credenciales **OAuth 2.0 Client ID** de tipo **Aplicación web**.
 * 3. Configurar URI de redirección local (p. ej. http://localhost:3000/api/…)
 *    cuando se implemente el callback en 5B.
 * 4. Ejecutar el flujo de consentimiento offline una sola vez con el scope
 *    `CALENDAR_READONLY_SCOPE` y obtener un **refresh token**.
 * 5. Guardar en `.env.local` (nunca en el repo):
 *    - GOOGLE_CALENDAR_CLIENT_ID
 *    - GOOGLE_CALENDAR_CLIENT_SECRET
 *    - GOOGLE_CALENDAR_REFRESH_TOKEN
 *    - GOOGLE_CALENDAR_IDS=primary
 *    - GOOGLE_CALENDAR_TIMEZONE=America/Argentina/Cordoba
 *    - GOOGLE_CALENDAR_DATA_SOURCE=google
 * 6. El servidor renovará access tokens con el refresh token; nada de eso
 *    se envía al navegador.
 *
 * Esta fase NO implementa la pantalla de consentimiento ni el intercambio
 * del código de autorización. No reutiliza la cuenta de servicio de Sheets.
 */
import 'server-only';

import { google } from 'googleapis';

import { CALENDAR_READONLY_SCOPE } from '@/lib/calendar/constants';
import type { CalendarOAuthConfig } from '@/lib/calendar/config';

export { CALENDAR_READONLY_SCOPE };

/** Cliente OAuth2 tipado desde googleapis (evita choque de tipos entre copias de google-auth-library). */
export type CalendarOAuthClient = InstanceType<typeof google.auth.OAuth2>;

/** Crea un cliente OAuth2 con refresh token (solo servidor). */
export function createCalendarOAuthClient(config: CalendarOAuthConfig): CalendarOAuthClient {
  const client = new google.auth.OAuth2(config.clientId, config.clientSecret);
  client.setCredentials({ refresh_token: config.refreshToken });
  return client;
}

/**
 * URL de consentimiento prevista para Fase 5B (no se usa todavía en la UI).
 * Documenta el scope único de solo lectura.
 */
export function buildConsentUrlPreview(
  config: Pick<CalendarOAuthConfig, 'clientId' | 'clientSecret'>,
  redirectUri: string,
): string {
  const client = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [CALENDAR_READONLY_SCOPE],
  });
}
