/**
 * Resolución pura de configuración Calendar (sin server-only).
 * Los lectores de process.env viven en `config.ts` (server-only).
 */
import {
  CALENDAR_TIMEZONE,
  DEFAULT_CALENDAR_ID,
  DEFAULT_CALENDAR_REDIRECT_URI,
} from '@/lib/calendar/constants';
import type { CalendarDataSourceMode } from '@/types/calendar';

export type EnvLike = Record<string, string | undefined>;

export function resolveCalendarDataSource(value: string | undefined): CalendarDataSourceMode {
  return value === 'google' ? 'google' : 'mock';
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
 * IDs permitidos: `primary` o identificadores típicos de Calendar.
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

export interface CalendarOAuthSetupConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export type CalendarOAuthSetupResult =
  { ok: true; config: CalendarOAuthSetupConfig } | { ok: false; reason: 'not-configured' };

export function resolveCalendarRedirectUri(env: EnvLike): string {
  return env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() || DEFAULT_CALENDAR_REDIRECT_URI;
}

export function resolveCalendarOAuthSetupConfig(env: EnvLike): CalendarOAuthSetupResult {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectUri = resolveCalendarRedirectUri(env);

  if (!clientId || !clientSecret || !redirectUri) {
    return { ok: false, reason: 'not-configured' };
  }

  return {
    ok: true,
    config: { clientId, clientSecret, redirectUri },
  };
}

export function resolveCalendarConfig(env: EnvLike): CalendarConfigResult {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, reason: 'not-configured' };
  }

  const idsResult = parseCalendarIds(env.GOOGLE_CALENDAR_IDS?.trim() || DEFAULT_CALENDAR_ID);
  if (!idsResult.ok) return { ok: false, reason: 'invalid-calendar-id' };

  const timezone = env.GOOGLE_CALENDAR_TIMEZONE?.trim() || CALENDAR_TIMEZONE;

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

export function resolveMockCalendarIds(env: EnvLike): string[] {
  const parsed = parseCalendarIds(env.GOOGLE_CALENDAR_IDS?.trim() || DEFAULT_CALENDAR_ID);
  return parsed.ok ? parsed.ids : [DEFAULT_CALENDAR_ID];
}

export function resolveCalendarTimezone(env: EnvLike): string {
  return env.GOOGLE_CALENDAR_TIMEZONE?.trim() || CALENDAR_TIMEZONE;
}
