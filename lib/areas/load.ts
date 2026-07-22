/**
 * Carga server-only del panel de Áreas (fallos parciales aislados).
 */
import 'server-only';

import { cache } from 'react';

import { composeAreaDashboard, composeAreasIndex, type AreaSheetsSlice } from '@/lib/areas/compose';
import { getCanonicalAreaDef, isAreaSlug } from '@/lib/areas/canonical';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getCalendarAgenda } from '@/lib/data/calendar-source';
import { getDataSource } from '@/lib/data/config';
import { getDomainPages } from '@/lib/data/domain-pages';
import { getNotionDashboard } from '@/lib/data/notion-source';
import type { AreaDashboardData, AreaDataSourceStatus, AreaSlug, AreaSummary } from '@/types/areas';
import type { CalendarEvent } from '@/types/calendar';

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

function notionSourceStatus(
  notion: Awaited<ReturnType<typeof getNotionDashboard>>,
): AreaDataSourceStatus {
  if (notion.status === 'ready') {
    return { kind: 'notion', state: 'ready', notice: null };
  }
  if (notion.status === 'mock') {
    return {
      kind: 'notion',
      state: isProductionRuntime() ? 'unavailable' : 'mock',
      notice: notion.notice,
    };
  }
  if (notion.status === 'empty') {
    return { kind: 'notion', state: 'empty', notice: notion.notice };
  }
  return { kind: 'notion', state: 'error', notice: notion.notice };
}

function calendarSourceStatus(
  agenda: Awaited<ReturnType<typeof getCalendarAgenda>>,
): AreaDataSourceStatus {
  if (agenda.status === 'ready') {
    return { kind: 'calendar', state: 'ready', notice: null };
  }
  if (agenda.status === 'mock') {
    return {
      kind: 'calendar',
      state: isProductionRuntime() ? 'unavailable' : 'mock',
      notice: agenda.notice,
    };
  }
  if (agenda.status === 'empty') {
    return { kind: 'calendar', state: 'empty', notice: agenda.notice };
  }
  return { kind: 'calendar', state: 'error', notice: agenda.notice };
}

function sheetsSliceFromDomain(
  pages: Awaited<ReturnType<typeof getDomainPages>>,
  slug: AreaSlug,
): { slice: AreaSheetsSlice | null; status: AreaDataSourceStatus } {
  const mode = getDataSource();
  const meta = pages.productivity;
  if (mode !== 'google') {
    if (isProductionRuntime()) {
      return {
        slice: null,
        status: {
          kind: 'sheets',
          state: 'not-applicable',
          notice: 'Sheets no aplicable en este entorno.',
        },
      };
    }
  }

  if (meta.status !== 'ready' && meta.status !== 'mock') {
    return {
      slice: null,
      status: {
        kind: 'sheets',
        state: meta.status === 'no-data' ? 'empty' : 'error',
        notice: meta.notice,
      },
    };
  }

  const faculty = pages.productivity.categories.find((item) => item.id === 'faculty');
  const work = pages.productivity.categories.find((item) => item.id === 'work');
  const sleep = pages.health.metrics.find((item) => /sue[nñ]o|sleep/i.test(item.label));
  const steps = pages.health.metrics.find((item) => /pasos|steps/i.test(item.label));
  const hr = pages.health.metrics.find((item) => /cardi|hr|fc/i.test(item.label));

  const slice: AreaSheetsSlice = {
    studyHoursWeek:
      slug === 'facultad' && faculty
        ? faculty.totalLabel || String(Math.round(faculty.totalMinutes / 60))
        : null,
    studyTrend: slug === 'facultad' ? (faculty?.compare.label ?? null) : null,
    workHoursWeek:
      slug === 'genova-trabajo' && work
        ? work.totalLabel || String(Math.round(work.totalMinutes / 60))
        : null,
    sleepHours: slug === 'salud' ? (sleep?.averageLabel ?? null) : null,
    energy: slug === 'salud' ? (hr?.averageLabel ?? null) : null,
    mood: null,
    exercise: slug === 'salud' ? (steps?.averageLabel ?? null) : null,
    coverage: slug === 'salud' ? (pages.health.notice ?? pages.productivity.coverageLabel) : null,
  };

  return {
    slice,
    status: {
      kind: 'sheets',
      state: meta.source === 'mock' ? (isProductionRuntime() ? 'not-applicable' : 'mock') : 'ready',
      notice: meta.notice,
    },
  };
}

function calendarEventsFromAgenda(
  agenda: Awaited<ReturnType<typeof getCalendarAgenda>>,
): CalendarEvent[] {
  if (isProductionRuntime() && agenda.source === 'mock') return [];
  return agenda.days.flatMap((day) => day.events);
}

export type AreasIndexResult =
  | { ok: true; summaries: AreaSummary[]; sources: readonly AreaDataSourceStatus[] }
  | { ok: false; code: 'notion-unavailable'; message: string };

export type AreaDashboardResult =
  | { ok: true; data: AreaDashboardData }
  | { ok: false; code: 'not-found' | 'not-canonical' | 'notion-unavailable'; message: string };

export const loadAreasIndex = cache(async (): Promise<AreasIndexResult> => {
  await requireAuthorizedSession();
  const notion = await getNotionDashboard();
  const notionStatus = notionSourceStatus(notion);

  if (notionStatus.state === 'error' || notionStatus.state === 'unavailable') {
    if (notion.areas.length === 0) {
      return {
        ok: false,
        code: 'notion-unavailable',
        message: notion.notice ?? 'Notion no disponible para Áreas.',
      };
    }
  }

  const { summaries, sources } = composeAreasIndex(notion, [notionStatus]);
  return { ok: true, summaries, sources };
});

export const loadAreaDashboard = cache(async (slugParam: string): Promise<AreaDashboardResult> => {
  await requireAuthorizedSession();

  if (!isAreaSlug(slugParam)) {
    return { ok: false, code: 'not-canonical', message: 'Área no canónica.' };
  }
  const slug = slugParam;
  if (!getCanonicalAreaDef(slug)) {
    return { ok: false, code: 'not-found', message: 'Área no encontrada.' };
  }

  const [notion, agenda] = await Promise.all([getNotionDashboard(), getCalendarAgenda('7')]);

  const notionStatus = notionSourceStatus(notion);
  if (
    notion.areas.length === 0 &&
    notionStatus.state !== 'ready' &&
    notionStatus.state !== 'mock'
  ) {
    return {
      ok: false,
      code: 'notion-unavailable',
      message: notion.notice ?? 'Notion no disponible.',
    };
  }

  let sheetsStatus: AreaDataSourceStatus = {
    kind: 'sheets',
    state: 'not-applicable',
    notice: null,
  };
  let sheets: AreaSheetsSlice | null = null;
  let allowMockMetrics = !isProductionRuntime();

  try {
    const pages = await getDomainPages(7);
    const sheetsResult = sheetsSliceFromDomain(pages, slug);
    sheets = sheetsResult.slice;
    sheetsStatus = sheetsResult.status;
    if (isProductionRuntime() && pages.productivity.source === 'mock') {
      sheets = null;
      allowMockMetrics = false;
      sheetsStatus = {
        kind: 'sheets',
        state: 'not-applicable',
        notice: 'Sheets no aplicable con datos simulados en Production.',
      };
    }
  } catch {
    sheetsStatus = {
      kind: 'sheets',
      state: 'error',
      notice: 'No se pudieron leer métricas de Sheets.',
    };
  }

  const calendarStatus = calendarSourceStatus(agenda);
  const events = calendarEventsFromAgenda(agenda);

  const data = composeAreaDashboard({
    slug,
    notion,
    calendarEvents: events,
    sheets,
    sources: [notionStatus, calendarStatus, sheetsStatus],
    northHint: null,
    allowMockMetrics,
  });

  if (!data) {
    return {
      ok: false,
      code: 'not-found',
      message: 'El Área canónica no está disponible en Notion.',
    };
  }

  return { ok: true, data };
});
