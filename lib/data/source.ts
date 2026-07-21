/**
 * Proveedor de datos de la vista Hoy (server-only).
 *
 * Combina Google Sheets DEV, Notion y Google Calendar. Un fallo de una fuente
 * no tumba a las otras. Cada fuente se consulta una sola vez por request.
 *
 * Composición testeable: `lib/data/compose-today.ts` + loaders inyectados.
 * Sheet plano: `lib/data/sheet-today.ts`.
 */
import { cache } from 'react';
import 'server-only';

import { buildMockToday } from '@/lib/adapters/mock';
import { calendarHoyNoticeFor } from '@/lib/calendar/errors';
import { emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import { loadTodayDataWith } from '@/lib/data/compose-today';
import { getCalendarTodayPreview } from '@/lib/data/calendar-source';
import { getDataSource, getGoogleConfig } from '@/lib/data/config';
import { absorbGoogleFetchFailure, buildTodayFromGoogleResults } from '@/lib/data/sheet-today';
import { REGISTRO_DIARIO_TAB, SALUD_TAB } from '@/lib/google/constants';
import { isMissingHeaderCode } from '@/lib/google/errors';
import { loadNotionDashboard } from '@/lib/notion/dashboard';
import type { TodayData } from '@/types';
import type { CalendarTodayPreview } from '@/types/calendar';

export { absorbGoogleFetchFailure, buildTodayFromGoogleResults } from '@/lib/data/sheet-today';

async function loadSheetBranch(): Promise<TodayData> {
  if (getDataSource() !== 'google') {
    return buildMockToday();
  }

  if (!getGoogleConfig().ok) {
    return buildTodayFromGoogleResults(
      { ok: false, code: 'not-configured' },
      { ok: true, values: [] },
    );
  }

  try {
    const { readTabValues } = await import('@/lib/google/sheets-read');
    const [registroResult, saludResult] = await Promise.all([
      readTabValues(REGISTRO_DIARIO_TAB),
      readTabValues(SALUD_TAB),
    ]);
    return buildTodayFromGoogleResults(registroResult, saludResult);
  } catch (error) {
    if (isMissingHeaderCode(error)) {
      return absorbGoogleFetchFailure(error);
    }
    return absorbGoogleFetchFailure(error);
  }
}

async function loadNotionDashboardSafe() {
  try {
    return await loadNotionDashboard();
  } catch {
    return null;
  }
}

async function loadCalendarBranch(): Promise<CalendarTodayPreview> {
  try {
    return await getCalendarTodayPreview();
  } catch {
    return emptyCalendarTodayPreview({
      source: 'google',
      status: 'read-error',
      notice: calendarHoyNoticeFor('read-error'),
    });
  }
}

async function loadTodayData(): Promise<TodayData> {
  const { requireAuthorizedSession } = await import('@/lib/auth/dal');
  await requireAuthorizedSession();

  return loadTodayDataWith({
    loadSheet: loadSheetBranch,
    loadNotionDashboard: loadNotionDashboardSafe,
    loadCalendar: loadCalendarBranch,
  });
}

/** Una sola composición por request (layout + página Hoy comparten el resultado). */
export const getTodayData = cache(loadTodayData);
