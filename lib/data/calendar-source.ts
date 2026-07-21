/**
 * Fuente de datos Calendar para /agenda y contratos Hoy (mock | google + fallback).
 * Independiente de Google Sheets y Notion.
 */
import { cache } from 'react';
import 'server-only';

import {
  getCalendarConfig,
  getCalendarDataSource,
  getCalendarTimezone,
  getMockCalendarIds,
} from '@/lib/calendar/config';
import { calendarNoticeFor, type CalendarReadCode } from '@/lib/calendar/errors';
import { buildMockCalendarEvents } from '@/lib/mock-data/google-calendar';
import {
  buildAgendaData,
  buildCalendarTodayPreview,
  parseAgendaView,
  viewRange,
} from '@/lib/calendar/summaries';
import { todayInCalendarTz } from '@/lib/calendar/time';
import type {
  CalendarAgendaData,
  CalendarAgendaView,
  CalendarTodayPreview,
} from '@/types/calendar';

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mockAgenda(
  view: CalendarAgendaView,
  status: CalendarAgendaData['status'],
  notice: string | null,
): CalendarAgendaData {
  const today = todayInCalendarTz();
  const timezone = getCalendarTimezone();
  const calendarIds = getMockCalendarIds();
  const events = buildMockCalendarEvents(today, calendarIds[0] ?? 'primary');
  return toPlain(
    buildAgendaData({
      events,
      view,
      today,
      source: status === 'mock' ? 'mock' : 'google',
      status,
      notice,
      calendarIds,
      timezone,
    }),
  );
}

function fallbackAgenda(view: CalendarAgendaView, code: CalendarReadCode): CalendarAgendaData {
  return mockAgenda(view, code, calendarNoticeFor(code));
}

async function loadAgendaUncached(view: CalendarAgendaView): Promise<CalendarAgendaData> {
  const mode = getCalendarDataSource();
  if (mode !== 'google') {
    return mockAgenda(view, 'mock', null);
  }

  const configResult = getCalendarConfig();
  if (!configResult.ok) {
    return fallbackAgenda(view, configResult.reason);
  }

  try {
    const { loadCalendarEventsInRange } = await import('@/lib/calendar/queries');
    const today = todayInCalendarTz();
    const range = viewRange(view, today);
    const result = await loadCalendarEventsInRange(configResult.config, range.start, range.end);
    if (!result.ok) return fallbackAgenda(view, result.code);

    const data = buildAgendaData({
      events: result.events,
      view,
      today,
      source: 'google',
      status: result.events.length === 0 ? 'empty' : 'ready',
      notice: result.events.length === 0 ? calendarNoticeFor('empty') : null,
      calendarIds: configResult.config.calendarIds,
      timezone: configResult.config.timezone,
    });
    return toPlain(data);
  } catch {
    return fallbackAgenda(view, 'read-error');
  }
}

/** Agenda por vista (cache por request + vista). */
export const getCalendarAgenda = cache(async (viewParam?: string | null) => {
  const view = parseAgendaView(viewParam);
  return loadAgendaUncached(view);
});

async function loadTodayPreviewUncached(): Promise<CalendarTodayPreview> {
  const agenda = await loadAgendaUncached('today');
  return toPlain(
    buildCalendarTodayPreview({
      events: agenda.timelineToday,
      today: agenda.targetDate,
      source: agenda.source,
      status: agenda.status,
      notice: agenda.notice,
      timezone: agenda.timezone,
    }),
  );
}

/**
 * Contrato preparado para Hoy / FocusCard.
 * No se usa todavía en getTodayData ni en app/page.tsx.
 */
export const getCalendarTodayPreview = cache(loadTodayPreviewUncached);

export { parseAgendaView };
