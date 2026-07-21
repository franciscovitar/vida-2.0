/**
 * Lectores de configuración Calendar desde process.env (server-only).
 * La lógica pura vive en `config-resolve.ts`.
 */
import 'server-only';

import {
  resolveCalendarConfig,
  resolveCalendarDataSource,
  resolveCalendarOAuthSetupConfig,
  resolveCalendarRedirectUri,
  resolveCalendarTimezone,
  resolveMockCalendarIds,
  type CalendarConfigResult,
  type CalendarOAuthSetupResult,
} from '@/lib/calendar/config-resolve';

export type {
  CalendarConfigResult,
  CalendarOAuthConfig,
  CalendarOAuthSetupConfig,
  CalendarOAuthSetupResult,
} from '@/lib/calendar/config-resolve';

export { isValidCalendarId, parseCalendarIds } from '@/lib/calendar/config-resolve';

export function getCalendarDataSource() {
  return resolveCalendarDataSource(process.env.GOOGLE_CALENDAR_DATA_SOURCE);
}

export function getCalendarRedirectUri(): string {
  return resolveCalendarRedirectUri(process.env);
}

export function getCalendarOAuthSetupConfig(): CalendarOAuthSetupResult {
  return resolveCalendarOAuthSetupConfig(process.env);
}

export function getCalendarConfig(): CalendarConfigResult {
  return resolveCalendarConfig(process.env);
}

export function getMockCalendarIds(): string[] {
  return resolveMockCalendarIds(process.env);
}

export function getCalendarTimezone(): string {
  return resolveCalendarTimezone(process.env);
}
