/**
 * Constantes Calendar (solo lectura).
 */

/** Scope OAuth por defecto de esta integración (lectura de eventos, sin escritura). */
export const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

/**
 * Scope opt-in: crear/cambiar/borrar eventos SOLO en calendarios propiedad del usuario.
 * No habilita escritura sobre calendarios compartidos ni ACLs.
 */
export const CALENDAR_EVENTS_OWNED_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

/** Scope opt-in: `calendars.get` para readiness del calendario dedicado (solo lectura). */
export const CALENDAR_CALENDARS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.calendars.readonly';

/**
 * Conjunto exacto y mínimo del modo opt-in local `hold-write` para Calendar Hold.
 * Nunca incluye el scope general `calendar` ni `calendar.events`.
 */
export const CALENDAR_HOLD_WRITE_SCOPES = [
  CALENDAR_READONLY_SCOPE,
  CALENDAR_EVENTS_OWNED_SCOPE,
  CALENDAR_CALENDARS_READONLY_SCOPE,
] as const;

/** Único valor de GOOGLE_CALENDAR_OAUTH_MODE que activa el modo opt-in de escritura para holds. */
export const CALENDAR_OAUTH_HOLD_WRITE_MODE = 'hold-write';

/** Zona horaria canónica de Vida 2.0 para Calendar. */
export const CALENDAR_TIMEZONE = 'America/Argentina/Cordoba';

/** Ventana civil usada para calcular huecos libres del día (no 24 h forzosas). */
export const FREE_BLOCK_DAY_START_MINUTES = 8 * 60;
export const FREE_BLOCK_DAY_END_MINUTES = 22 * 60;

/** ID por defecto cuando GOOGLE_CALENDAR_IDS no aporta valores válidos en mock. */
export const DEFAULT_CALENDAR_ID = 'primary';

/** Redirect URI DEV canónico (debe coincidir con Google Cloud Console). */
export const DEFAULT_CALENDAR_REDIRECT_URI = 'http://localhost:3000/api/calendar/oauth/callback';

/** Cookie HttpOnly del state OAuth (path limitado al flujo). */
export const CALENDAR_OAUTH_STATE_COOKIE = 'vida_cal_oauth_state';

/** Max-Age breve del state (10 minutos). */
export const CALENDAR_OAUTH_STATE_MAX_AGE_SEC = 600;

/** Endpoint de autorización Google OAuth 2.0. */
export const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
