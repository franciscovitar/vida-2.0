/**
 * Configuración Google Calendar desde variables de entorno (solo servidor).
 * No registra ni expone client secret ni refresh token.
 */
import { CALENDAR_TIMEZONE, DEFAULT_CALENDAR_ID } from '@/lib/calendar/constants';
import type { CalendarDataSourceMode } from '@/types/calendar';

export function getCalendarDataSource(): CalendarDataSourceMode {
  return process.env.GOOGLE_CALENDAR_DATA_SOURCE === 'google' ? 'google' : 'mock';
}

/**
 * Normaliza GOOGLE_CALENDAR_IDS (lista separada por comas).
 * Rechaza vacíos; elimina duplicados conservando el orden.
 */
export function parseCalendarIds(
  raw: string | undefined,
): { ok: true; ids: string[] } | { ok: false; reason: 'invalid-calendar-id' } {
  if (raw === undefined || raw.trim() === '') {
    return { ok: false, reason: 'invalid-calendar-id' };
  }

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const part of raw.split(',')) {
    const id = part.trim();
    if (!id) return { ok: false, reason: 'invalid-calendar-id' };
    if (!isValidCalendarId(id)) return { ok: false, reason: 'invalid-calendar-id' };
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  if (ids.length === 0) return { ok: false, reason: 'invalid-calendar-id' };
  return { ok: true, ids };
}

/**
 * IDs permitidos en esta fase: `primary` o identificadores tipicos de Calendar
 * (email o id opaco con caracteres seguros). Sin búsqueda global de calendarios.
 */
export function isValidCalendarId(id: string): boolean {
  if (id === 'primary') return true;
  if (id.length < 3 || id.length > 256) return false;
  if (/\s/.test(id)) return false;
  return /^[A-Za-z0-9@._\-#]+$/.test(id);
}

export interface CalendarOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarIds: string[];
  timezone: string;
}

export type CalendarConfigResult =
  | { ok: true; config: CalendarOAuthConfig }
  | {
      ok: false;
      reason: 'not-configured' | 'invalid-calendar-id';
    };

/**
 * Lee la configuración OAuth. Sin los tres secretos → not-configured.
 * IDs inválidos → invalid-calendar-id.
 */
export function getCalendarConfig(): CalendarConfigResult {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, reason: 'not-configured' };
  }

  const idsResult = parseCalendarIds(
    process.env.GOOGLE_CALENDAR_IDS?.trim() || DEFAULT_CALENDAR_ID,
  );
  if (!idsResult.ok) return { ok: false, reason: 'invalid-calendar-id' };

  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || CALENDAR_TIMEZONE;

  return {
    ok: true,
    config: {
      clientId,
      clientSecret,
      refreshToken,
      calendarIds: idsResult.ids,
      timezone,
    },
  };
}

/** IDs efectivos para mock (siempre al menos primary). */
export function getMockCalendarIds(): string[] {
  const parsed = parseCalendarIds(process.env.GOOGLE_CALENDAR_IDS?.trim() || DEFAULT_CALENDAR_ID);
  return parsed.ok ? parsed.ids : [DEFAULT_CALENDAR_ID];
}

export function getCalendarTimezone(): string {
  return process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || CALENDAR_TIMEZONE;
}
