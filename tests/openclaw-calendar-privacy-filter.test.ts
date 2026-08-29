/**
 * Regresión: OpenClaw Production devolvía HTTP 500 en system.overview porque el
 * Calendar real contiene eventos recurrentes titulados «📓 Journaling» y el
 * read-boundary (regla /journaling/i, fail-closed) bloqueaba la respuesta entera.
 *
 * La política centralizada Calendar → OpenClaw excluye esos eventos por completo
 * antes del DTO. El read-boundary se conserva intacto como defensa final.
 * /agenda web no aplica este filtro.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { adaptCalendarEvent, type GoogleCalendarEventRaw } from '@/lib/calendar/adapters';
import { buildAgendaData, parseAgendaView } from '@/lib/calendar/summaries';
import {
  filterCalendarEventsForOpenClaw,
  isOpenClawExcludedCalendarEvent,
} from '@/lib/openclaw/calendar-privacy';
import { validateOpenClawReadBoundary } from '@/lib/openclaw/read-boundary';
import type { CalendarEvent } from '@/types/calendar';

const calendarSourcePath = path.join(process.cwd(), 'lib/data/calendar-source.ts');
const readBoundaryPath = path.join(process.cwd(), 'lib/openclaw/read-boundary.ts');
const TZ = 'America/Argentina/Buenos_Aires';

function timedRaw(
  id: string,
  summary: string,
  date: string,
  start: string,
  end: string,
  extras?: Partial<GoogleCalendarEventRaw>,
): GoogleCalendarEventRaw {
  return {
    id,
    summary,
    status: 'confirmed',
    transparency: 'opaque',
    start: { dateTime: `${date}T${start}:00-03:00` },
    end: { dateTime: `${date}T${end}:00-03:00` },
    ...extras,
  };
}

/** Agenda «real-like»: eventos normales + una serie recurrente «📓 Journaling». */
function realLikeEvents(today: string): CalendarEvent[] {
  const raw: GoogleCalendarEventRaw[] = [
    timedRaw('evt-daily', 'Daily de Genova', today, '09:30', '09:45'),
    timedRaw('evt-study', 'Bloque de estudio: TP SO', today, '10:00', '12:00'),
    timedRaw('evt-journaling', '📓 Journaling', today, '22:30', '22:45', {
      recurringEventId: 'series-journaling',
    }),
    timedRaw('evt-gym', 'Gimnasio', today, '20:00', '21:00'),
  ];
  return raw
    .map((item) => adaptCalendarEvent(item, 'primary', TZ))
    .filter((event): event is CalendarEvent => event !== null);
}

function overviewUpcomingEvents(events: readonly CalendarEvent[]) {
  return events.slice(0, 10).map((event) => ({
    key: `cal-${event.id.length}`,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
  }));
}

test('política Calendar → OpenClaw: identifica y excluye eventos de Journaling', () => {
  const today = '2026-08-29';
  const events = realLikeEvents(today);

  const journaling = events.find((event) => event.title.includes('Journaling'));
  assert.ok(journaling);
  assert.equal(isOpenClawExcludedCalendarEvent(journaling), true);

  // Case-insensitive y sin depender del emoji.
  assert.equal(
    isOpenClawExcludedCalendarEvent({ title: 'JOURNALING', calendarLabel: null, location: null }),
    true,
  );
  assert.equal(
    isOpenClawExcludedCalendarEvent({
      title: 'Journaling reflexivo',
      calendarLabel: null,
      location: null,
    }),
    true,
  );
  assert.equal(
    isOpenClawExcludedCalendarEvent({
      title: 'Daily de Genova',
      calendarLabel: null,
      location: null,
    }),
    false,
  );
  // También cubre el calendario/ubicación proyectables.
  assert.equal(
    isOpenClawExcludedCalendarEvent({
      title: 'Reservado',
      calendarLabel: 'Journaling',
      location: null,
    }),
    true,
  );

  const filtered = filterCalendarEventsForOpenClaw(events);
  assert.equal(filtered.length, events.length - 1);
  assert.equal(
    filtered.some((event) => /journaling/i.test(event.title)),
    false,
  );
  assert.deepEqual(filtered.map((event) => event.title).sort(), [
    'Bloque de estudio: TP SO',
    'Daily de Genova',
    'Gimnasio',
  ]);
});

test('system.overview: agenda real-like con Journaling supera la frontera y no lo expone', () => {
  const today = '2026-08-29';
  const raw = realLikeEvents(today);

  // DTO sin filtrar: el evento Journaling hace fallar la frontera (causa del 500).
  const unfiltered = buildAgendaData({
    events: raw,
    view: parseAgendaView('7'),
    today,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarCount: 1,
    timezone: TZ,
  });
  const unfilteredEvents = unfiltered.days.flatMap((day) => day.events);
  assert.equal(
    validateOpenClawReadBoundary({
      data: { upcomingEvents: overviewUpcomingEvents(unfilteredEvents) },
    }).ok,
    false,
  );

  // DTO con la política aplicada (misma ruta que getCalendarAgendaForTrustedService).
  const agenda = buildAgendaData({
    events: filterCalendarEventsForOpenClaw(raw),
    view: parseAgendaView('7'),
    today,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarCount: 1,
    timezone: TZ,
  });
  const projectedEvents = agenda.days.flatMap((day) => day.events);
  const upcomingEvents = overviewUpcomingEvents(projectedEvents);

  assert.ok(upcomingEvents.length >= 2, 'la agenda conserva los eventos normales');
  assert.equal(
    upcomingEvents.some((event) => /journaling/i.test(event.title)),
    false,
  );
  assert.equal(JSON.stringify(agenda).toLowerCase().includes('journaling'), false);
  assert.deepEqual(
    validateOpenClawReadBoundary({
      data: {
        upcomingEvents,
        upcomingTasks: [],
        areasCount: 4,
      },
      sources: ['notion', 'calendar', 'sheets'],
      warnings: [],
      nextCursor: null,
      itemCount: upcomingEvents.length,
      dataFreshness: 'live',
    }),
    { ok: true },
  );
});

test('calendar.upcoming: la política evita exponer Journaling en su DTO', () => {
  const today = '2026-08-29';
  const agenda = buildAgendaData({
    events: filterCalendarEventsForOpenClaw(realLikeEvents(today)),
    view: parseAgendaView('7'),
    today,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarCount: 1,
    timezone: TZ,
  });

  const events = agenda.days.flatMap((day) =>
    day.events.map((event) => ({
      key: `cal-${event.id.length}`,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      allDay: event.allDay,
      calendarLabel: event.calendarLabel ?? null,
    })),
  );

  assert.ok(events.length >= 2);
  assert.equal(
    events.some((event) => /journaling/i.test(event.title)),
    false,
  );
  assert.deepEqual(
    validateOpenClawReadBoundary({
      data: { days: agenda.days.map((day) => day.date), events },
      sources: ['calendar'],
      warnings: [],
      nextCursor: null,
      itemCount: events.length,
      dataFreshness: 'live',
    }),
    { ok: true },
  );
});

test('areas.get: recibe la agenda ya filtrada (mismo lector trusted)', () => {
  const today = '2026-08-29';
  const agenda = buildAgendaData({
    events: filterCalendarEventsForOpenClaw(realLikeEvents(today)),
    view: parseAgendaView('7'),
    today,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarCount: 1,
    timezone: TZ,
  });

  // reads.ts pasa `agenda.days.flatMap((day) => day.events)` a composeAreaDashboard.
  const calendarEvents = agenda.days.flatMap((day) => day.events);
  assert.equal(
    calendarEvents.some((event) => /journaling/i.test(event.title)),
    false,
  );

  const reads = readFileSync(path.join(process.cwd(), 'lib/openclaw/reads.ts'), 'utf8');
  assert.match(reads, /operation === 'areas\.get'[\s\S]*?getCalendarAgendaForTrustedService/);
});

test('/agenda web conserva su comportamiento: sin filtro de privacidad OpenClaw', () => {
  const source = readFileSync(calendarSourcePath, 'utf8');

  const webStart = source.indexOf('export const getCalendarAgenda = cache');
  const trustedStart = source.indexOf('export const getCalendarAgendaForTrustedService');
  const hoyStart = source.indexOf('function hoyFallbackPreview');
  const webBlock = source.slice(webStart, trustedStart);
  const trustedBlock = source.slice(trustedStart, hoyStart);

  // El wrapper web sigue exigiendo sesión y NO aplica el filtro OpenClaw.
  assert.match(webBlock, /requireAuthorizedSession/);
  assert.match(webBlock, /loadAgendaUncached\(view\)/);
  assert.equal(webBlock.includes('filterCalendarEventsForOpenClaw'), false);

  // El lector trusted (server-to-server) es el único que aplica la política.
  assert.match(trustedBlock, /loadAgendaUncached\(view, filterCalendarEventsForOpenClaw\)/);

  // Y a nivel de datos: una agenda construida sin el filtro sigue mostrando Journaling.
  const today = '2026-08-29';
  const webAgenda = buildAgendaData({
    events: realLikeEvents(today),
    view: parseAgendaView('7'),
    today,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarCount: 1,
    timezone: TZ,
  });
  assert.equal(
    webAgenda.days.flatMap((day) => day.events).some((event) => /journaling/i.test(event.title)),
    true,
  );
});

test('read-boundary sigue fail-closed: rechaza explícitamente Journaling si hay regresión', () => {
  // La regla no se debilitó ni se eliminó.
  const boundarySource = readFileSync(readBoundaryPath, 'utf8');
  assert.match(boundarySource, /\/journaling\/i/);

  // Si una regresión vuelve a proyectar el evento, la frontera lo bloquea.
  assert.equal(
    validateOpenClawReadBoundary({
      data: {
        upcomingEvents: [
          {
            key: 'cal-x',
            title: '📓 Journaling',
            startDate: '2026-08-29',
            endDate: '2026-08-29',
            startTime: '22:30',
            endTime: '22:45',
            allDay: false,
          },
        ],
      },
    }).ok,
    false,
  );
});
