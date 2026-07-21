/**
 * Fase 5C — Calendar integrado en Hoy (FocusCard, agenda, sugerencias, aislamiento).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildMockToday } from '@/lib/adapters/mock';
import { adaptCalendarEvent, type GoogleCalendarEventRaw } from '@/lib/calendar/adapters';
import { occupiedMinutesForDate } from '@/lib/calendar/classify';
import { CALENDAR_READONLY_SCOPE } from '@/lib/calendar/constants';
import { computeFocusBlock } from '@/lib/calendar/focus';
import { buildCalendarTodayPreview, emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import { hoyNotionUnavailable, mergeTodayWithNotion } from '@/lib/data/combine-hoy';
import { loadTodayDataWith, mockCalendarLoader } from '@/lib/data/compose-today';
import { isJsonPlain, toPlainTodayData } from '@/lib/data/plain';
import { buildMockNotionDashboard } from '@/lib/mock-data/notion';
import { taskDateKind } from '@/lib/notion/classify';
import { buildHoyNotionView, suggestNextActions } from '@/lib/notion/hoy';
import { summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import { isResolvedSpreadsheetId } from '@/lib/validation/spreadsheet-id';
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';
import type { CalendarEvent, CalendarTodayPreview } from '@/types/calendar';
import type { NotionDashboardData, NotionTask } from '@/types/notion';

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

function timed(
  id: string,
  title: string,
  start: string,
  end: string,
  extra?: Partial<GoogleCalendarEventRaw>,
): CalendarEvent {
  return adaptCalendarEvent(timedRaw(id, title, TODAY, start, end, extra), 'primary')!;
}

function previewFrom(
  events: CalendarEvent[],
  nowHour = 12,
  nowMinute = 0,
  status: CalendarTodayPreview['status'] = 'ready',
): CalendarTodayPreview {
  const now = new Date(
    `${TODAY}T${String(nowHour).padStart(2, '0')}:${String(nowMinute).padStart(2, '0')}:00-03:00`,
  );
  return buildCalendarTodayPreview({
    events,
    today: TODAY,
    source: 'google',
    status,
    notice: null,
    timezone: 'America/Argentina/Cordoba',
    now,
  });
}

function fullDashboard(overrides?: Partial<NotionDashboardData>): NotionDashboardData {
  const base = buildMockNotionDashboard(TODAY);
  return {
    ...base,
    source: 'mock',
    status: 'mock',
    notice: null,
    syncedAt: '2026-07-20T12:00:00.000Z',
    taskSummary: summarizeTasks(base.tasks),
    projectSummary: summarizeProjects(base.projects),
    ...overrides,
  };
}

function task(
  partial: Partial<NotionTask> & Pick<NotionTask, 'id' | 'title' | 'status'>,
): NotionTask {
  const date = partial.date ?? null;
  return {
    priority: null,
    duration: null,
    energy: null,
    project: null,
    area: null,
    projectArea: null,
    blocker: null,
    note: null,
    domain: 'tasks',
    date,
    dateKind: taskDateKind(partial.status, date, TODAY),
    ...partial,
  };
}

test('HC1. evento actual aparece en FocusCard (preview)', () => {
  const events = [timed('a', 'Reunión', '14:00', '15:00')];
  const preview = previewFrom(events, 14, 30);
  assert.equal(preview.focus.status, 'in-event');
  assert.equal(preview.focus.currentEvent?.title, 'Reunión');
  assert.equal(preview.currentEvent?.title, 'Reunión');
  assert.ok((preview.focus.minutesRemaining ?? 0) > 0);
});

test('HC2. próximo evento aparece cuando no existe evento actual', () => {
  const events = [timed('a', 'Temprano', '09:00', '10:00'), timed('b', 'Tarde', '15:00', '16:00')];
  const preview = previewFrom(events, 12, 0);
  assert.equal(preview.focus.status, 'between-events');
  assert.equal(preview.focus.currentEvent, null);
  assert.equal(preview.focus.nextEvent?.title, 'Tarde');
  assert.equal(preview.nextEvent?.title, 'Tarde');
});

test('HC3. tiempo hasta próximo evento es correcto', () => {
  const events = [timed('b', 'Tarde', '15:00', '16:00')];
  const focus = computeFocusBlock(events, TODAY, 12 * 60);
  assert.equal(focus.minutesUntilNext, 180);
});

test('HC4. sin eventos muestra estado vacío', () => {
  const preview = previewFrom([], 12, 0, 'empty');
  assert.equal(preview.focus.status, 'empty-day');
  assert.equal(preview.todayEvents.length, 0);
  assert.equal(preview.occupiedMinutes, 0);
});

test('HC5. sin más eventos muestra el estado free', () => {
  const events = [timed('a', 'Mañana', '08:00', '09:00')];
  const preview = previewFrom(events, 18, 0);
  assert.equal(preview.focus.status, 'free');
  assert.equal(preview.focus.nextEvent, null);
  assert.ok((preview.focus.remainingFreeMinutes ?? 0) >= 0);
});

test('HC6. evento cancelado no aparece', () => {
  const events = [
    timed('a', 'Vivo', '10:00', '11:00'),
    timed('b', 'Cancelado', '12:00', '13:00', { status: 'cancelled' }),
  ];
  const preview = previewFrom(events, 9, 0);
  assert.equal(preview.todayEvents.length, 1);
  assert.equal(preview.todayEvents[0].title, 'Vivo');
  assert.ok(!preview.todayEvents.some((e) => e.status === 'cancelled'));
});

test('HC7. evento transparente no bloquea tiempo', () => {
  const opaque = timed('a', 'A', '10:00', '11:00');
  const transparent = timed('b', 'B', '10:00', '11:00', { transparency: 'transparent' });
  assert.equal(transparent.blocksTime, false);
  assert.equal(occupiedMinutesForDate([opaque, transparent], TODAY), 60);
  const preview = previewFrom([opaque, transparent], 9, 0);
  assert.equal(preview.occupiedMinutes, 60);
});

test('HC8. evento de día completo no bloquea 24 horas', () => {
  const allDay = adaptCalendarEvent(
    {
      id: 'ad',
      summary: 'Feriado',
      status: 'confirmed',
      transparency: 'opaque',
      start: { date: TODAY },
      end: { date: '2026-07-21' },
    },
    'primary',
  )!;
  const preview = previewFrom([allDay], 12, 0);
  assert.equal(preview.occupiedMinutes, 0);
  assert.equal(preview.focus.status, 'empty-day');
  assert.ok(preview.todayEvents[0].allDay);
});

test('HC9. agenda de Hoy está ordenada', () => {
  const events = [timed('b', 'Tarde', '15:00', '16:00'), timed('a', 'Mañana', '09:00', '10:00')];
  const preview = previewFrom(events, 8, 0);
  assert.deepEqual(
    preview.todayEvents.map((e) => e.startTime),
    ['09:00', '15:00'],
  );
});

test('HC10. eventos superpuestos muestran conflicto', () => {
  const events = [timed('a', 'A', '10:00', '12:00'), timed('b', 'B', '11:00', '11:45')];
  const preview = previewFrom(events, 9, 0);
  assert.ok(preview.conflicts.length >= 2);
  assert.ok(preview.todayEvents.every((e) => e.overlaps));
});

test('HC11. minutos ocupados no se duplican', () => {
  const events = [timed('a', 'A', '10:00', '12:00'), timed('b', 'B', '11:00', '11:45')];
  const preview = previewFrom(events, 9, 0);
  assert.equal(preview.occupiedMinutes, 120);
});

test('HC12. Calendar se obtiene una sola vez por carga (React cache + server-only)', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'data', 'source.ts'), 'utf8');
  const calendarSource = readFileSync(
    join(process.cwd(), 'lib', 'data', 'calendar-source.ts'),
    'utf8',
  );
  const config = readFileSync(join(process.cwd(), 'lib', 'calendar', 'config.ts'), 'utf8');
  assert.match(source, /import 'server-only'/);
  assert.match(calendarSource, /import 'server-only'/);
  assert.match(config, /import 'server-only'/);
  assert.match(source, /getCalendarTodayPreview/);
  assert.match(source, /loadTodayDataWith/);
  assert.match(calendarSource, /export const getCalendarTodayPreview = cache\(/);
  assert.equal((source.match(/getCalendarTodayPreview/g) ?? []).length, 2);
});

test('HC12b. ningún use client importa módulos Calendar sensibles', () => {
  const clients = [
    'components/dashboard/QuickInbox.tsx',
    'components/habits/HabitsBoard.tsx',
    'components/notion/TasksBoard.tsx',
    'components/notion/ProjectsBoard.tsx',
    'components/ui/ThemeToggle.tsx',
    'components/navigation/MobileNav.tsx',
  ];
  for (const rel of clients) {
    const content = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.match(content, /'use client'/);
    assert.doesNotMatch(content, /calendar-source|lib\/calendar\/config['"]|lib\/calendar\/token/);
    assert.doesNotMatch(content, /lib\/calendar\/client|lib\/calendar\/queries|lib\/data\/source/);
  }
});

test('HC13. fallo Calendar no rompe Sheets', () => {
  const sheet = buildMockToday();
  sheet.source = 'google';
  sheet.status = 'ready';
  const calendar = emptyCalendarTodayPreview({
    source: 'google',
    status: 'auth-error',
    notice: 'No se pudo autenticar con Google Calendar.',
  });
  const notion = buildHoyNotionView(fullDashboard({ source: 'notion', status: 'ready' }));
  const merged = mergeTodayWithNotion(sheet, notion, calendar);
  assert.equal(merged.status, 'ready');
  assert.ok(merged.habits.length > 0);
  assert.equal(merged.calendar.status, 'auth-error');
  assert.equal(merged.calendar.todayEvents.length, 0);
});

test('HC14. fallo Calendar no rompe Notion', () => {
  const sheet = buildMockToday();
  const notion = buildHoyNotionView(fullDashboard({ source: 'notion', status: 'ready' }));
  const calendar = emptyCalendarTodayPreview({
    source: 'google',
    status: 'read-error',
    notice: 'error',
  });
  const merged = mergeTodayWithNotion(sheet, notion, calendar);
  assert.ok(merged.notion.dueToday.length >= 0);
  assert.equal(merged.notion.status, 'ready');
  assert.equal(merged.calendar.status, 'read-error');
});

test('HC15. fallo Sheets no rompe Calendar', () => {
  const sheet = buildMockToday();
  sheet.source = 'google';
  sheet.status = 'auth-error';
  sheet.notice = 'Sheet caído';
  const calendar = previewFrom([timed('a', 'OK', '22:30', '22:45')], 10, 0);
  const notion = buildHoyNotionView(fullDashboard());
  const merged = mergeTodayWithNotion(sheet, notion, calendar);
  assert.equal(merged.calendar.status, 'ready');
  assert.equal(merged.calendar.todayEvents[0].title, 'OK');
});

test('HC16. fallo Notion no rompe Calendar', () => {
  const sheet = buildMockToday();
  sheet.source = 'google';
  sheet.status = 'ready';
  const calendar = previewFrom([timed('a', 'OK', '22:30', '22:45')], 10, 0);
  const merged = mergeTodayWithNotion(sheet, hoyNotionUnavailable('Notion caído'), calendar);
  assert.equal(merged.calendar.status, 'ready');
  assert.equal(merged.notion.status, 'read-error');
  assert.ok(merged.sources.find((s) => s.id === 'calendar')?.ready);
});

test('HC17. sugerencia de 1 h no aparece en bloque libre de 15 minutos', () => {
  const calendar = previewFrom([timed('e', 'Pronto', '12:15', '12:30')], 12, 0);
  assert.ok((calendar.focus.minutesUntilNext ?? 99) <= 15);
  const data = fullDashboard({
    tasks: [
      task({
        id: 'long',
        title: 'Tarea larga',
        status: 'Pendiente',
        date: TODAY,
        priority: 'Alta',
        duration: '1 h',
      }),
      task({
        id: 'short',
        title: 'Tarea corta',
        status: 'Pendiente',
        date: TODAY,
        priority: 'Alta',
        duration: '5-15 min',
      }),
    ],
  });
  const actions = suggestNextActions(data, calendar);
  assert.ok(!actions.some((a) => a.id === 'task:long'));
  assert.ok(actions.some((a) => a.id === 'task:short' || a.id.startsWith('event:')));
});

test('HC18. tarea de 15 minutos puede aparecer en bloque de 30 minutos', () => {
  const calendar = previewFrom([timed('e', 'Después', '13:00', '14:00')], 12, 0);
  assert.equal(calendar.focus.minutesUntilNext, 60);
  const data = fullDashboard({
    tasks: [
      task({
        id: 'fit',
        title: 'Cabida',
        status: 'Pendiente',
        date: TODAY,
        priority: 'Alta',
        duration: '5-15 min',
      }),
    ],
  });
  const actions = suggestNextActions(data, calendar);
  assert.ok(actions.some((a) => a.id === 'task:fit'));
});

test('HC19. tarea sin duración no se descarta por duración inventada', () => {
  const calendar = previewFrom([timed('e', 'Pronto', '12:15', '12:30')], 12, 0);
  const data = fullDashboard({
    tasks: [
      task({
        id: 'nodur',
        title: 'Sin duración',
        status: 'Pendiente',
        date: TODAY,
        priority: 'Alta',
        duration: null,
      }),
    ],
  });
  const actions = suggestNextActions(data, calendar);
  assert.ok(actions.some((a) => a.id === 'task:nodur'));
});

test('HC20. sugerencias no contienen duplicados', () => {
  const data = fullDashboard();
  const actions = suggestNextActions(data, previewFrom([], 12, 0, 'empty'));
  const ids = actions.map((a) => a.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('HC21. máximo tres sugerencias', () => {
  const data = fullDashboard({
    tasks: [
      task({ id: '1', title: 'A', status: 'Pendiente', date: TODAY, priority: 'Alta' }),
      task({ id: '2', title: 'B', status: 'Pendiente', date: TODAY, priority: 'Alta' }),
      task({ id: '3', title: 'C', status: 'Pendiente', date: TODAY, priority: 'Alta' }),
      task({ id: '4', title: 'D', status: 'Pendiente', date: TODAY, priority: 'Alta' }),
    ],
  });
  assert.ok(suggestNextActions(data, null, 3).length <= 3);
});

test('HC22. ningún token llega al DTO', () => {
  const sheet = buildMockToday();
  const notion = buildHoyNotionView(fullDashboard());
  const calendar = previewFrom([timed('a', 'J', '22:30', '22:45')], 10, 0);
  const merged = toPlainTodayData(mergeTodayWithNotion(sheet, notion, calendar));
  const json = JSON.stringify(merged);
  assert.doesNotMatch(
    json,
    /GOOGLE_CALENDAR_CLIENT_SECRET|refresh_token|ya29\.|BEGIN PRIVATE|client_secret/i,
  );
});

test('HC23. ningún objeto SDK llega al cliente', () => {
  const preview = previewFrom([timed('a', 'J', '22:30', '22:45')], 10, 0);
  assert.equal(Object.getPrototypeOf(preview), Object.prototype);
  assert.ok(!('response' in preview));
  assert.ok(!('config' in preview));
});

test('HC24. resultado final soporta JSON.stringify', () => {
  const merged = mergeTodayWithNotion(
    buildMockToday(),
    buildHoyNotionView(fullDashboard()),
    previewFrom([timed('a', 'J', '22:30', '22:45')], 10, 0),
  );
  assert.doesNotThrow(() => JSON.stringify(merged));
  assert.equal(isJsonPlain(merged), true);
});

test('HC25. resultado final soporta structuredClone', () => {
  const merged = toPlainTodayData(
    mergeTodayWithNotion(
      buildMockToday(),
      buildHoyNotionView(fullDashboard()),
      previewFrom([timed('a', 'J', '22:30', '22:45')], 10, 0),
    ),
  );
  assert.doesNotThrow(() => structuredClone(merged));
});

test('HC26. no existe ninguna operación Calendar de escritura', () => {
  const roots = [
    join(process.cwd(), 'lib', 'calendar'),
    join(process.cwd(), 'lib', 'data', 'calendar-source.ts'),
    join(process.cwd(), 'components', 'dashboard', 'FocusCard.tsx'),
    join(process.cwd(), 'components', 'dashboard', 'TodayAgenda.tsx'),
  ];
  for (const root of roots) {
    const files =
      root.endsWith('.ts') || root.endsWith('.tsx')
        ? [root]
        : (readdirSync(root, { recursive: true }) as string[])
            .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
            .map((entry) => join(root, entry));
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      assert.doesNotMatch(content, /events\.(insert|update|patch|delete|move|quickAdd)\b/);
    }
  }
  assert.match(CALENDAR_READONLY_SCOPE, /calendar\.events\.readonly$/);
});

test('HC27. escritura de hábitos sigue limitada al target resuelto', () => {
  assert.equal(isResolvedSpreadsheetId('dev-id', 'dev-id'), true);
  assert.equal(isResolvedSpreadsheetId('prod-sheet-id', 'dev-id'), false);
  const previewProd = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'prod',
    GOOGLE_SHEETS_DEV_ID: 'dev-id',
    GOOGLE_SHEETS_PROD_ID: 'prod-sheet-id',
    VERCEL_ENV: 'preview',
  });
  assert.equal(previewProd.ok, false);
});

test('HC28. / funciona con Calendar real (contrato cableado)', () => {
  const page = readFileSync(join(process.cwd(), 'app', '(app)', 'page.tsx'), 'utf8');
  assert.match(page, /FocusCard calendar=\{today\.calendar\}/);
  assert.match(page, /TodayAgenda calendar=\{today\.calendar\}/);
  assert.match(page, /calendar=\{today\.calendar\}/);
});

test('HC29. / funciona con fallback Calendar', () => {
  const sheet = buildMockToday();
  const calendar = emptyCalendarTodayPreview({
    source: 'google',
    status: 'auth-error',
    notice: 'No se pudo autenticar con Google Calendar.',
  });
  const merged = mergeTodayWithNotion(sheet, buildHoyNotionView(fullDashboard()), calendar);
  assert.equal(merged.calendar.todayEvents.length, 0);
  assert.ok(merged.calendar.notice);
  assert.ok(merged.sources.some((s) => s.id === 'calendar' && s.mode === 'fallback'));
  assert.notEqual(merged.header.syncLabel, 'Google Sheets + Notion + Calendar');
});

test('HC30. móvil no tiene scroll horizontal en Hoy', () => {
  const pageScss = readFileSync(join(process.cwd(), 'app', '(app)', 'page.module.scss'), 'utf8');
  const agendaScss = readFileSync(
    join(process.cwd(), 'components', 'dashboard', 'TodayAgenda.module.scss'),
    'utf8',
  );
  const focusScss = readFileSync(
    join(process.cwd(), 'components', 'dashboard', 'FocusCard.module.scss'),
    'utf8',
  );
  for (const content of [pageScss, agendaScss, focusScss]) {
    assert.doesNotMatch(content, /overflow-x:\s*scroll/);
    assert.doesNotMatch(content, /min-width:\s*[5-9]\d{2,}px/);
  }
});

test('HC31. composición mock incluye calendar y tres fuentes (loaders inyectados)', async () => {
  const base = buildMockNotionDashboard(TODAY);
  const data = await loadTodayDataWith({
    loadSheet: async () => buildMockToday(),
    loadNotionDashboard: async () => ({
      ...base,
      source: 'mock',
      status: 'mock',
      notice: null,
      syncedAt: '2026-07-20T12:00:00.000Z',
      taskSummary: summarizeTasks(base.tasks),
      projectSummary: summarizeProjects(base.projects),
    }),
    loadCalendar: mockCalendarLoader(),
  });
  assert.ok(data.calendar);
  assert.ok(data.sources.some((s) => s.id === 'calendar'));
  assert.equal(data.sources.length, 3);
  assert.doesNotThrow(() => structuredClone(toPlainTodayData(data)));
  assert.equal(isJsonPlain(data), true);
});
