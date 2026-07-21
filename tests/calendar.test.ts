import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { addDaysYmd } from '@/lib/adapters/dates';
import {
  adaptCalendarEvent,
  adaptEventTime,
  filterVisibleEvents,
  type GoogleCalendarEventRaw,
} from '@/lib/calendar/adapters';
import { freeBlocksForDate, markOverlaps, occupiedMinutesForDate } from '@/lib/calendar/classify';
import {
  isValidCalendarId,
  parseCalendarIds,
  resolveCalendarConfig,
  resolveCalendarDataSource,
} from '@/lib/calendar/config-resolve';
import { CALENDAR_READONLY_SCOPE } from '@/lib/calendar/constants';
import { computeFocusBlock } from '@/lib/calendar/focus';
import {
  buildAgendaData,
  buildCalendarTodayPreview,
  parseAgendaView,
} from '@/lib/calendar/summaries';
import { todayInCalendarTz, zonedDateTimeParts } from '@/lib/calendar/time';
import { getDataSource } from '@/lib/data/config';
import {
  buildMockCalendarEvents,
  buildMockCalendarRawEvents,
} from '@/lib/mock-data/google-calendar';
import { getNotionDataSource } from '@/lib/notion/config';
import { isResolvedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

const TODAY = '2026-07-20';

function timedRaw(
  id: string,
  title: string,
  date: string,
  start: string,
  end: string,
  extra?: Partial<GoogleCalendarEventRaw>,
): GoogleCalendarEventRaw {
  return {
    id,
    summary: title,
    status: 'confirmed',
    transparency: 'opaque',
    start: { dateTime: `${date}T${start}:00-03:00` },
    end: { dateTime: `${date}T${end}:00-03:00` },
    ...extra,
  };
}

test('C1. modo mock funciona sin credenciales', () => {
  const prev = process.env.GOOGLE_CALENDAR_DATA_SOURCE;
  const prevId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  assert.equal(resolveCalendarDataSource('mock'), 'mock');
  assert.equal(resolveCalendarDataSource(undefined), 'mock');
  process.env.GOOGLE_CALENDAR_DATA_SOURCE = 'mock';
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  assert.equal(resolveCalendarDataSource(process.env.GOOGLE_CALENDAR_DATA_SOURCE), 'mock');
  const events = buildMockCalendarEvents(TODAY);
  assert.ok(events.length > 0);
  const agenda = buildAgendaData({
    events,
    view: 'today',
    today: TODAY,
    source: 'mock',
    status: 'mock',
    notice: null,
    calendarIds: ['primary'],
  });
  assert.equal(agenda.status, 'mock');
  assert.ok(agenda.timelineToday.length > 0);
  process.env.GOOGLE_CALENDAR_DATA_SOURCE = prev;
  process.env.GOOGLE_CALENDAR_CLIENT_ID = prevId;
});

test('C2. modo google sin credenciales usa fallback sin 500', () => {
  const keys = [
    'GOOGLE_CALENDAR_DATA_SOURCE',
    'GOOGLE_CALENDAR_CLIENT_ID',
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    'GOOGLE_CALENDAR_REFRESH_TOKEN',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.GOOGLE_CALENDAR_DATA_SOURCE = 'google';
    for (const k of keys.slice(1)) delete process.env[k];
    assert.equal(resolveCalendarDataSource(process.env.GOOGLE_CALENDAR_DATA_SOURCE), 'google');
    const config = resolveCalendarConfig(process.env);
    assert.equal(config.ok, false);
    if (!config.ok) assert.equal(config.reason, 'not-configured');
    const events = buildMockCalendarEvents(TODAY);
    const agenda = buildAgendaData({
      events,
      view: 'today',
      today: TODAY,
      source: 'google',
      status: 'not-configured',
      notice: 'Integración con Google Calendar no configurada. Mostrando datos simulados.',
      calendarIds: ['primary'],
    });
    assert.equal(agenda.status, 'not-configured');
    assert.ok(agenda.notice);
    assert.doesNotThrow(() => JSON.stringify(agenda));
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('C3. solo calendar IDs autorizados son aceptados en config', () => {
  assert.equal(isValidCalendarId('primary'), true);
  assert.equal(isValidCalendarId('user@example.com'), true);
  assert.equal(isValidCalendarId(''), false);
  assert.equal(isValidCalendarId('bad id'), false);
  const client = readFileSync(join(process.cwd(), 'lib', 'calendar', 'client.ts'), 'utf8');
  assert.match(client, /config\.calendarIds\.includes/);
  assert.match(client, /events\.list/);
});

test('C4. IDs vacíos o duplicados son rechazados o normalizados', () => {
  assert.equal(parseCalendarIds('').ok, false);
  assert.equal(parseCalendarIds('primary,,work').ok, false);
  assert.equal(parseCalendarIds('  ').ok, false);
  const dup = parseCalendarIds('primary,primary,user@x.com');
  assert.equal(dup.ok, true);
  if (dup.ok) assert.deepEqual(dup.ids, ['primary', 'user@x.com']);
});

test('C5. evento con hora se adapta correctamente', () => {
  const event = adaptCalendarEvent(timedRaw('t1', 'Daily', TODAY, '09:30', '09:45'), 'primary');
  assert.ok(event);
  assert.equal(event?.allDay, false);
  assert.equal(event?.startDate, TODAY);
  assert.equal(event?.startTime, '09:30');
  assert.equal(event?.endTime, '09:45');
  assert.equal(event?.durationMinutes, 15);
});

test('C6. evento de día completo conserva la fecha local', () => {
  const time = adaptEventTime({
    start: { date: '2026-07-20' },
    end: { date: '2026-07-21' },
  });
  assert.ok(time);
  assert.equal(time?.allDay, true);
  assert.equal(time?.startDate, '2026-07-20');
  assert.equal(time?.endDate, '2026-07-20');
  assert.equal(time?.startTime, null);
  assert.equal(time?.endTime, null);
});

test('C7. evento recurrente expandido se adapta', () => {
  const event = adaptCalendarEvent(
    timedRaw('r1', 'Standup', TODAY, '09:00', '09:15', {
      recurringEventId: 'series-1',
    }),
    'primary',
  );
  assert.equal(event?.recurring, true);
});

test('C8. evento cancelado se excluye', () => {
  const events = buildMockCalendarEvents(TODAY);
  assert.ok(events.some((e) => e.status === 'cancelled'));
  const visible = filterVisibleEvents(events);
  assert.ok(visible.every((e) => e.status !== 'cancelled'));
  const agenda = buildAgendaData({
    events,
    view: 'today',
    today: TODAY,
    source: 'mock',
    status: 'mock',
    notice: null,
    calendarIds: ['primary'],
  });
  assert.ok(agenda.timelineToday.every((e) => e.status !== 'cancelled'));
});

test('C9. evento transparente no suma tiempo ocupado', () => {
  const opaque = adaptCalendarEvent(timedRaw('a', 'A', TODAY, '10:00', '11:00'), 'primary');
  const transparent = adaptCalendarEvent(
    timedRaw('b', 'B', TODAY, '10:00', '11:00', { transparency: 'transparent' }),
    'primary',
  );
  assert.ok(opaque && transparent);
  assert.equal(transparent?.blocksTime, false);
  assert.equal(occupiedMinutesForDate([opaque!, transparent!], TODAY), 60);
});

test('C10. eventos superpuestos no duplican minutos ocupados', () => {
  const a = adaptCalendarEvent(timedRaw('a', 'A', TODAY, '10:00', '12:00'), 'primary');
  const b = adaptCalendarEvent(timedRaw('b', 'B', TODAY, '11:00', '11:45'), 'primary');
  assert.ok(a && b);
  assert.equal(occupiedMinutesForDate([a!, b!], TODAY), 120);
  const marked = markOverlaps([a!, b!]);
  assert.ok(marked.every((e) => e.overlaps));
});

test('C11. próximo evento se calcula correctamente', () => {
  const events = [
    adaptCalendarEvent(timedRaw('a', 'Temprano', TODAY, '09:00', '10:00'), 'primary')!,
    adaptCalendarEvent(timedRaw('b', 'Tarde', TODAY, '15:00', '16:00'), 'primary')!,
  ];
  const focus = computeFocusBlock(events, TODAY, 12 * 60);
  assert.equal(focus.nextEvent?.title, 'Tarde');
  assert.equal(focus.minutesUntilNext, 180);
});

test('C12. evento actual se calcula correctamente', () => {
  const events = [adaptCalendarEvent(timedRaw('a', 'Ahora', TODAY, '14:00', '15:00'), 'primary')!];
  const focus = computeFocusBlock(events, TODAY, 14 * 60 + 30);
  assert.equal(focus.currentEvent?.title, 'Ahora');
  assert.equal(focus.status, 'in-event');
});

test('C13. espacios libres se calculan correctamente', () => {
  const events = [adaptCalendarEvent(timedRaw('a', 'A', TODAY, '10:00', '12:00'), 'primary')!];
  const gaps = freeBlocksForDate(events, TODAY);
  assert.ok(gaps.some((g) => g.startTime === '08:00' && g.endTime === '10:00'));
  assert.ok(gaps.some((g) => g.startTime === '12:00' && g.endTime === '22:00'));
});

test('C14. un día sin eventos funciona', () => {
  const emptyDay = addDaysYmd(TODAY, 3);
  const events = buildMockCalendarEvents(TODAY);
  const agenda = buildAgendaData({
    events,
    view: '7',
    today: TODAY,
    source: 'mock',
    status: 'mock',
    notice: null,
    calendarIds: ['primary'],
  });
  const day = agenda.days.find((d) => d.date === emptyDay);
  assert.ok(day);
  assert.equal(day?.empty, true);
  assert.equal(day?.events.length, 0);
});

test('C15. fechas no se desplazan por UTC', () => {
  const parts = zonedDateTimeParts('2026-07-20T22:30:00-03:00');
  assert.equal(parts.date, '2026-07-20');
  assert.equal(parts.time, '22:30');
  const allDay = adaptEventTime({
    start: { date: '2026-07-20' },
    end: { date: '2026-07-21' },
  });
  assert.equal(allDay?.startDate, '2026-07-20');
  assert.equal(todayInCalendarTz(new Date('2026-07-20T12:00:00-03:00')), '2026-07-20');
});

test('C16. respuestas son objetos planos serializables', () => {
  const events = buildMockCalendarEvents(TODAY);
  const agenda = buildAgendaData({
    events,
    view: '7',
    today: TODAY,
    source: 'mock',
    status: 'mock',
    notice: null,
    calendarIds: ['primary'],
  });
  const preview = buildCalendarTodayPreview({
    events,
    today: TODAY,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  assert.doesNotThrow(() => JSON.stringify(agenda));
  assert.doesNotThrow(() => JSON.stringify(preview));
  const roundtrip = JSON.parse(JSON.stringify(agenda));
  assert.equal(roundtrip.summary.totalEvents, agenda.summary.totalEvents);
});

test('C17. ningún secreto llega al DTO', () => {
  const events = buildMockCalendarEvents(TODAY);
  const agenda = buildAgendaData({
    events,
    view: 'today',
    today: TODAY,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarIds: ['primary'],
  });
  const json = JSON.stringify(agenda);
  assert.doesNotMatch(
    json,
    /GOOGLE_CALENDAR_CLIENT_SECRET|refresh_token|BEGIN PRIVATE KEY|ya29\./i,
  );
  assert.doesNotMatch(json, /ejemplo_client_secret|ejemplo_refresh_token/i);
});

test('C18. no existen operaciones de escritura Calendar', () => {
  const root = join(process.cwd(), 'lib', 'calendar');
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(root, entry));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      /events\.(insert|update|patch|delete|move|quickAdd|import|watch)\b/,
    );
    assert.doesNotMatch(content, /calendar\.freebusy\b/);
    assert.doesNotMatch(content, /calendar\.acl\b/);
    assert.doesNotMatch(content, /calendar\.calendarList\b/);
  }
  assert.match(CALENDAR_READONLY_SCOPE, /calendar\.events\.readonly$/);
});

test('C19. Google Sheets y Notion continúan funcionando', () => {
  assert.ok(getDataSource() === 'mock' || getDataSource() === 'google');
  assert.ok(getNotionDataSource() === 'mock' || getNotionDataSource() === 'notion');
  assert.equal(isResolvedSpreadsheetId('dev-id', 'dev-id'), true);
  assert.equal(parseAgendaView('30'), '30');
  assert.equal(parseAgendaView('nope'), 'today');
});

test('C20. /agenda sin overflow-x scroll de layout', () => {
  const page = readFileSync(
    join(process.cwd(), 'app', '(app)', 'agenda', 'page.module.scss'),
    'utf8',
  );
  const board = readFileSync(
    join(process.cwd(), 'components', 'calendar', 'AgendaBoard.module.scss'),
    'utf8',
  );
  assert.match(page, /min-width:\s*0/);
  assert.match(board, /min-width:\s*0/);
  assert.doesNotMatch(page + board, /overflow-x:\s*scroll/);
});

test('C21. mocks incluyen día completo, multi-día y solapes', () => {
  const raw = buildMockCalendarRawEvents(TODAY);
  assert.ok(raw.some((e) => e.start?.date && !e.start.dateTime));
  assert.ok(raw.some((e) => e.recurringEventId));
  const events = buildMockCalendarEvents(TODAY);
  assert.ok(events.some((e) => e.multiDay));
  assert.ok(markOverlaps(events).some((e) => e.overlaps));
});

test('C22. .env* ignorado y .env.example permitido', () => {
  const gitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env\*/m);
  assert.match(gitignore, /^!\.env\.example/m);
  const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  assert.match(example, /GOOGLE_CALENDAR_DATA_SOURCE/);
  assert.match(example, /GOOGLE_CALENDAR_IDS=primary/);
  assert.match(example, /America\/Argentina\/Cordoba/);
});
