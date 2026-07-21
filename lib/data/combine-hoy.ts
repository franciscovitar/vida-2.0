/**
 * Combina Sheet DEV + Notion + Calendar en TodayData sin acoplar fallos.
 */
import { emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import { isCalendarHoyUnavailable } from '@/lib/calendar/errors';
import { emptyHoyNotionView, buildHoyNotionView } from '@/lib/notion/hoy';
import type { TodayData, TodaySourceStatus, TodayStatus } from '@/types';
import type { CalendarTodayPreview } from '@/types/calendar';
import type { HoyNotionView, NotionDashboardData, NotionIntegrationStatus } from '@/types/notion';

function sheetSourceFromToday(today: TodayData): TodaySourceStatus {
  const label = 'Sheet DEV';
  if (today.source === 'mock' || today.status === 'mock') {
    return {
      id: 'sheet',
      label,
      ready: false,
      mode: 'mock',
      detail: 'Datos simulados',
    };
  }
  if (today.status === 'ready') {
    return {
      id: 'sheet',
      label,
      ready: true,
      mode: 'live',
      detail: null,
    };
  }
  if (today.status === 'no-data') {
    return {
      id: 'sheet',
      label,
      ready: false,
      mode: 'partial',
      detail: today.notice,
    };
  }
  return {
    id: 'sheet',
    label,
    ready: false,
    mode: today.status === 'not-configured' ? 'error' : 'fallback',
    detail: today.notice,
  };
}

function notionSourceFromView(notion: HoyNotionView): TodaySourceStatus {
  const label = 'Notion';
  const status: NotionIntegrationStatus = notion.status;

  if (status === 'mock' || notion.source === 'mock') {
    return {
      id: 'notion',
      label,
      ready: false,
      mode: 'mock',
      detail: notion.notice ?? 'Datos simulados',
    };
  }
  if (status === 'ready') {
    return {
      id: 'notion',
      label,
      ready: true,
      mode: 'live',
      detail: null,
    };
  }
  if (status === 'empty') {
    return {
      id: 'notion',
      label,
      ready: true,
      mode: 'partial',
      detail: notion.notice,
    };
  }
  if (status === 'not-configured') {
    return {
      id: 'notion',
      label,
      ready: false,
      mode: 'error',
      detail: notion.notice,
    };
  }
  return {
    id: 'notion',
    label,
    ready: false,
    mode: 'fallback',
    detail: notion.notice,
  };
}

function calendarSourceFromPreview(calendar: CalendarTodayPreview): TodaySourceStatus {
  const label = 'Calendar';
  if (calendar.status === 'mock' || calendar.source === 'mock') {
    return {
      id: 'calendar',
      label,
      ready: false,
      mode: 'mock',
      detail: calendar.notice ?? 'Datos simulados',
    };
  }
  if (calendar.status === 'ready') {
    return {
      id: 'calendar',
      label,
      ready: true,
      mode: 'live',
      detail: null,
    };
  }
  if (calendar.status === 'empty') {
    return {
      id: 'calendar',
      label,
      ready: true,
      mode: 'live',
      detail: calendar.notice,
    };
  }
  if (calendar.status === 'not-configured') {
    return {
      id: 'calendar',
      label,
      ready: false,
      mode: 'error',
      detail: calendar.notice,
    };
  }
  return {
    id: 'calendar',
    label,
    ready: false,
    mode: isCalendarHoyUnavailable(calendar.status) ? 'fallback' : 'fallback',
    detail: calendar.notice,
  };
}

function combinedHeader(
  sheet: TodayData,
  sheetSrc: TodaySourceStatus,
  notionSrc: TodaySourceStatus,
  calendarSrc: TodaySourceStatus,
): TodayData['header'] {
  const sources = [sheetSrc, notionSrc, calendarSrc];
  const live = sources.filter((s) => s.ready && s.mode === 'live');
  const anyFallback = sources.some(
    (s) => s.mode === 'fallback' || s.mode === 'error' || s.mode === 'partial',
  );
  const allMock = sources.every((s) => s.mode === 'mock');

  if (allMock) {
    return {
      ...sheet.header,
      syncOk: sheet.header.syncOk,
      syncLabel: sheet.header.syncLabel,
    };
  }

  if (live.length === 3) {
    return {
      ...sheet.header,
      syncOk: true,
      syncLabel: 'Sheet DEV + Notion + Calendar',
    };
  }

  if (live.length === 2) {
    return {
      ...sheet.header,
      syncOk: false,
      syncLabel: `${live.map((s) => s.label).join(' + ')} · parcial`,
    };
  }

  if (live.length === 1) {
    return {
      ...sheet.header,
      syncOk: false,
      syncLabel: `${live[0].label} · integración parcial`,
    };
  }

  if (anyFallback || sheet.status !== 'mock') {
    return {
      ...sheet.header,
      syncOk: false,
      syncLabel: 'Sin conexión completa',
    };
  }

  return sheet.header;
}

/**
 * Adjunta Notion + Calendar a un TodayData de Sheet/mock y recalcula fuentes + sync.
 * No afirma “todo conectado” si alguna fuente está en fallback o error.
 */
export function mergeTodayWithNotion(
  sheetToday: TodayData,
  notion: HoyNotionView,
  calendar: CalendarTodayPreview = emptyCalendarTodayPreview(),
): TodayData {
  const sheetSrc = sheetSourceFromToday(sheetToday);
  const notionSrc = notionSourceFromView(notion);
  const calendarSrc = calendarSourceFromPreview(calendar);
  return {
    ...sheetToday,
    notion,
    calendar,
    sources: [sheetSrc, notionSrc, calendarSrc],
    header: combinedHeader(sheetToday, sheetSrc, notionSrc, calendarSrc),
  };
}

export function hoyNotionFromDashboard(
  data: NotionDashboardData,
  calendar?: CalendarTodayPreview | null,
): HoyNotionView {
  return buildHoyNotionView(data, calendar);
}

/** Vista Notion vacía segura cuando la carga falla de forma inesperada. */
export function hoyNotionUnavailable(notice: string): HoyNotionView {
  return {
    ...emptyHoyNotionView(),
    status: 'read-error',
    source: 'notion',
    notice,
  };
}

/** Placeholders para constructores de Sheet/mock antes del merge. */
export function todayNotionPlaceholders(): Pick<TodayData, 'sources' | 'notion' | 'calendar'> {
  const notion = emptyHoyNotionView();
  const calendar = emptyCalendarTodayPreview();
  return {
    notion,
    calendar,
    sources: [
      {
        id: 'sheet',
        label: 'Sheet DEV',
        ready: false,
        mode: 'mock',
        detail: null,
      },
      {
        id: 'notion',
        label: 'Notion',
        ready: false,
        mode: 'mock',
        detail: null,
      },
      {
        id: 'calendar',
        label: 'Calendar',
        ready: false,
        mode: 'mock',
        detail: null,
      },
    ],
  };
}

export type { TodayStatus };
