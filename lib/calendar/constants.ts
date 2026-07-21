/**
 * Constantes Calendar (solo lectura).
 */

/** Scope OAuth exclusivo de esta integración (sin escritura). */
export const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

/** Zona horaria canónica de Vida 2.0 para Calendar. */
export const CALENDAR_TIMEZONE = 'America/Argentina/Cordoba';

/** Ventana civil usada para calcular huecos libres del día (no 24 h forzosas). */
export const FREE_BLOCK_DAY_START_MINUTES = 8 * 60;
export const FREE_BLOCK_DAY_END_MINUTES = 22 * 60;

/** ID por defecto cuando GOOGLE_CALENDAR_IDS no aporta valores válidos en mock. */
export const DEFAULT_CALENDAR_ID = 'primary';
