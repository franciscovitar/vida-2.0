/**
 * Combina Sheet DEV + Notion en TodayData sin acoplar fallos entre fuentes.
 */
import { emptyHoyNotionView, buildHoyNotionView } from '@/lib/notion/hoy';
import type { TodayData, TodaySourceStatus, TodayStatus } from '@/types';
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

function combinedHeader(
  sheet: TodayData,
  sheetSrc: TodaySourceStatus,
  notionSrc: TodaySourceStatus,
): TodayData['header'] {
  const liveCount = [sheetSrc, notionSrc].filter((s) => s.ready && s.mode === 'live').length;
  const anyFallback = [sheetSrc, notionSrc].some(
    (s) => s.mode === 'fallback' || s.mode === 'error' || s.mode === 'partial',
  );
  const bothMock = sheetSrc.mode === 'mock' && notionSrc.mode === 'mock';

  if (bothMock) {
    return {
      ...sheet.header,
      syncOk: sheet.header.syncOk,
      syncLabel: sheet.header.syncLabel,
    };
  }

  if (liveCount === 2) {
    return {
      ...sheet.header,
      syncOk: true,
      syncLabel: 'Sheet DEV + Notion',
    };
  }

  if (liveCount === 1) {
    const which = sheetSrc.ready && sheetSrc.mode === 'live' ? 'Sheet DEV' : 'Notion';
    return {
      ...sheet.header,
      syncOk: false,
      syncLabel: `${which} · integración parcial`,
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

/** Adjunta Notion a un TodayData de Sheet/mock y recalcula fuentes + sync. */
export function mergeTodayWithNotion(sheetToday: TodayData, notion: HoyNotionView): TodayData {
  const sheetSrc = sheetSourceFromToday(sheetToday);
  const notionSrc = notionSourceFromView(notion);
  return {
    ...sheetToday,
    notion,
    sources: [sheetSrc, notionSrc],
    header: combinedHeader(sheetToday, sheetSrc, notionSrc),
  };
}

export function hoyNotionFromDashboard(data: NotionDashboardData): HoyNotionView {
  return buildHoyNotionView(data);
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
export function todayNotionPlaceholders(): Pick<TodayData, 'sources' | 'notion'> {
  const notion = emptyHoyNotionView();
  return {
    notion,
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
    ],
  };
}

export type { TodayStatus };
