/**
 * Fuente de datos Calendar para /agenda y contratos Hoy (mock | google + fallback).
 * Server-only: lee env, OAuth refresh y consulta events.list.
 *
 * Hoy usa `getCalendarTodayPreview`: en modo google, un fallo NO inyecta
 * eventos mock (aviso localizado + agenda vacía).
 * /agenda también falla cerrado: mantiene la vista vacía y el aviso real.
 */
import { cache } from 'react';
import 'server-only';

import {
  getCalendarConfig,
  getCalendarDataSource,
  getCalendarTimezone,
  getMockCalendarIds,
} from '@/lib/calendar/config';
import {
  calendarHoyNoticeFor,
  calendarNoticeFor,
  type CalendarReadCode,
} from '@/lib/calendar/errors';
import { buildMockCalendarEvents } from '@/lib/mock-data/google-calendar';
import {
  buildAgendaData,
  buildCalendarTodayPreview,
  buildUnavailableAgendaData,
  emptyCalendarTodayPreview,
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

function mockAgenda(view: CalendarAgendaView): CalendarAgendaData {
  const today = todayInCalendarTz();
  const timezone = getCalendarTimezone();
  const calendarIds = getMockCalendarIds();
  const events = buildMockCalendarEvents(today, calendarIds[0] ?? 'primary');
  return toPlain(
    buildAgendaData({
      events,
      view,
      today,
      source: 'mock',
      status: 'mock',
      notice: null,
      calendarCount: calendarIds.length,
      timezone,
    }),
  );
}

function fallbackAgenda(view: CalendarAgendaView, code: CalendarReadCode): CalendarAgendaData {
  return toPlain(
    buildUnavailableAgendaData({
      view,
      today: todayInCalendarTz(),
      status: code,
      notice: calendarNoticeFor(code),
      timezone: getCalendarTimezone(),
    }),
  );
}

async function loadAgendaUncached(view: CalendarAgendaView): Promise<CalendarAgendaData> {
  const mode = getCalendarDataSource();
  if (mode !== 'google') {
    return mockAgenda(view);
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
      calendarCount: configResult.config.calendarIds.length,
      timezone: configResult.config.timezone,
    });
    const { traceCalendarStage } = await import('@/lib/calendar/trace');
    traceCalendarStage(7);
    const plain = toPlain(data);
    traceCalendarStage(8);
    return plain;
  } catch {
    return fallbackAgenda(view, 'read-error');
  }
}

/** Agenda por vista (cache por request + vista). */
export const getCalendarAgenda = cache(async (viewParam?: string | null) => {
  const { requireAuthorizedSession } = await import('@/lib/auth/dal');
  await requireAuthorizedSession();
  const view = parseAgendaView(viewParam);
  return loadAgendaUncached(view);
});

function hoyFallbackPreview(code: CalendarReadCode): CalendarTodayPreview {
  return toPlain(
    emptyCalendarTodayPreview({
      today: todayInCalendarTz(),
      source: 'google',
      status: code,
      notice: calendarHoyNoticeFor(code),
      timezone: getCalendarTimezone(),
    }),
  );
}

/**
 * Preview Hoy: una sola lectura Calendar por request (React cache).
 * Fallos en modo google → vacío + aviso (sin mocks silenciosos).
 */
async function loadTodayPreviewUncached(): Promise<CalendarTodayPreview> {
  const { requireAuthorizedSession } = await import('@/lib/auth/dal');
  await requireAuthorizedSession();

  const mode = getCalendarDataSource();
  if (mode !== 'google') {
    const today = todayInCalendarTz();
    const timezone = getCalendarTimezone();
    const calendarIds = getMockCalendarIds();
    const events = buildMockCalendarEvents(today, calendarIds[0] ?? 'primary');
    return toPlain(
      buildCalendarTodayPreview({
        events,
        today,
        source: 'mock',
        status: 'mock',
        notice: null,
        timezone,
      }),
    );
  }

  const configResult = getCalendarConfig();
  if (!configResult.ok) {
    return hoyFallbackPreview(configResult.reason);
  }

  try {
    const { loadCalendarEventsInRange } = await import('@/lib/calendar/queries');
    const today = todayInCalendarTz();
    const range = viewRange('today', today);
    const result = await loadCalendarEventsInRange(configResult.config, range.start, range.end);
    if (!result.ok) return hoyFallbackPreview(result.code);

    return toPlain(
      buildCalendarTodayPreview({
        events: result.events,
        today,
        source: 'google',
        status: result.events.length === 0 ? 'empty' : 'ready',
        notice: result.events.length === 0 ? calendarNoticeFor('empty') : null,
        timezone: configResult.config.timezone,
      }),
    );
  } catch {
    return hoyFallbackPreview('read-error');
  }
}

/** Contrato Calendar para Hoy / FocusCard (cache por request). */
export const getCalendarTodayPreview = cache(loadTodayPreviewUncached);
