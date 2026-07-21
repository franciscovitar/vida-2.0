/**
 * Composición pura de Hoy a partir de ramas ya cargadas (testeable, sin server-only).
 */
import { emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import { calendarHoyNoticeFor } from '@/lib/calendar/errors';
import {
  hoyNotionFromDashboard,
  hoyNotionUnavailable,
  mergeTodayWithNotion,
} from '@/lib/data/combine-hoy';
import { toPlainTodayData } from '@/lib/data/plain';
import type { TodayData } from '@/types';
import type { CalendarTodayPreview } from '@/types/calendar';
import type { NotionDashboardData } from '@/types/notion';

export interface TodayDataLoaders {
  loadSheet: () => Promise<TodayData>;
  loadNotionDashboard: () => Promise<NotionDashboardData | null>;
  loadCalendar: () => Promise<CalendarTodayPreview>;
}

/** Une Sheet + Notion + Calendar en un DTO plano. */
export function composeHoyData(
  sheetToday: TodayData,
  notionDashboard: NotionDashboardData | null,
  calendar: CalendarTodayPreview,
): TodayData {
  const notionView =
    notionDashboard === null
      ? hoyNotionUnavailable('No se pudo leer Notion. El resto de Hoy sigue disponible.')
      : hoyNotionFromDashboard(notionDashboard, calendar);

  return toPlainTodayData(mergeTodayWithNotion(sheetToday, notionView, calendar));
}

/**
 * Carga las tres ramas vía loaders inyectables y compone Hoy.
 * Los loaders reales (Calendar/Sheets) viven en `source.ts` (server-only).
 */
export async function loadTodayDataWith(loaders: TodayDataLoaders): Promise<TodayData> {
  const [sheetToday, notionDashboard, calendar] = await Promise.all([
    loaders.loadSheet(),
    loaders.loadNotionDashboard(),
    loaders.loadCalendar(),
  ]);
  return composeHoyData(sheetToday, notionDashboard, calendar);
}

/** Loader Calendar de fallback seguro (sin I/O) para pruebas. */
export function mockCalendarLoader(
  preview?: CalendarTodayPreview,
): () => Promise<CalendarTodayPreview> {
  const value =
    preview ??
    emptyCalendarTodayPreview({
      source: 'mock',
      status: 'mock',
      notice: null,
    });
  return async () => value;
}

/** Loader Calendar de error localizado (sin I/O) para pruebas de aislamiento. */
export function failingCalendarLoader(): () => Promise<CalendarTodayPreview> {
  return async () =>
    emptyCalendarTodayPreview({
      source: 'google',
      status: 'read-error',
      notice: calendarHoyNoticeFor('read-error'),
    });
}
