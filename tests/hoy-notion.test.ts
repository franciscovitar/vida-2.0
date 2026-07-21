import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildMockToday } from '@/lib/adapters/mock';
import {
  hoyNotionFromDashboard,
  hoyNotionUnavailable,
  mergeTodayWithNotion,
} from '@/lib/data/combine-hoy';
import { loadTodayDataWith, mockCalendarLoader } from '@/lib/data/compose-today';
import { isJsonPlain, toPlainTodayData } from '@/lib/data/plain';
import { emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import { buildMockNotionDashboard } from '@/lib/mock-data/notion';
import { taskDateKind } from '@/lib/notion/classify';
import {
  buildHoyNotionView,
  emptyHoyNotionView,
  isHoyOverdueTask,
  suggestNextActions,
} from '@/lib/notion/hoy';
import { summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import type { NotionDashboardData, NotionTask } from '@/types/notion';

const TODAY = '2026-07-20';

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

test('H1. tareas con fecha hoy aparecen en Hoy', () => {
  const view = buildHoyNotionView(fullDashboard());
  assert.ok(view.dueToday.length > 0);
  assert.ok(view.dueToday.every((t) => t.date === TODAY));
  assert.ok(view.dueToday.some((t) => t.title.includes('TP de SO')));
});

test('H2. tareas hechas de hoy no aparecen como pendientes', () => {
  const data = fullDashboard({
    tasks: [
      task({
        id: 'done-today',
        title: 'Hecha hoy',
        status: 'Hecha',
        date: TODAY,
        priority: 'Alta',
      }),
      task({
        id: 'open-today',
        title: 'Abierta hoy',
        status: 'Pendiente',
        date: TODAY,
        priority: 'Media',
      }),
    ],
  });
  const view = buildHoyNotionView(data);
  assert.equal(view.dueToday.length, 1);
  assert.equal(view.dueToday[0].id, 'open-today');
  assert.ok(!view.dueToday.some((t) => t.status === 'Hecha'));
});

test('H3. tarea pasada pendiente aparece vencida', () => {
  const data = fullDashboard({
    tasks: [
      task({
        id: 'overdue-1',
        title: 'Vencida',
        status: 'Pendiente',
        date: '2026-07-18',
        priority: 'Media',
      }),
    ],
  });
  const view = buildHoyNotionView(data);
  assert.equal(view.overdue.length, 1);
  assert.equal(view.overdue[0].id, 'overdue-1');
});

test('H4. tarea sin fecha no aparece vencida', () => {
  const t = task({
    id: 'no-date',
    title: 'Sin fecha',
    status: 'Pendiente',
    date: null,
  });
  assert.equal(isHoyOverdueTask(t), false);
  const view = buildHoyNotionView(fullDashboard({ tasks: [t] }));
  assert.equal(view.overdue.length, 0);
});

test('H5. tarea Algún día no aparece vencida', () => {
  const t = task({
    id: 'someday',
    title: 'Algún día vieja',
    status: 'Algún día',
    date: '2026-07-01',
    priority: 'Alta',
  });
  assert.equal(isHoyOverdueTask(t), false);
  const view = buildHoyNotionView(fullDashboard({ tasks: [t] }));
  assert.equal(view.overdue.length, 0);
});

test('H6. proyecto activo aparece', () => {
  const view = buildHoyNotionView(fullDashboard());
  assert.ok(view.activeProjects.some((p) => p.name.includes('Genova')));
  assert.ok(view.activeProjects.every((p) => p.name.length > 0));
});

test('H7. proyecto completado o cancelado no aparece como activo', () => {
  const view = buildHoyNotionView(fullDashboard());
  assert.ok(!view.activeProjects.some((p) => p.name.includes('Archivo')));
  assert.equal(
    view.activeProjects.length,
    fullDashboard().projects.filter((p) => p.status === 'Activo').length,
  );
});

test('H8. proyecto activo sin próxima acción se identifica', () => {
  const base = fullDashboard();
  const projects = base.projects.map((p) =>
    p.status === 'Activo' ? { ...p, nextAction: null } : p,
  );
  const view = buildHoyNotionView({ ...base, projects });
  assert.ok(view.activeProjects.some((p) => p.withoutNextAction));
  assert.ok(view.summary.withoutNextAction > 0);
});

test('H9. las próximas acciones no contienen duplicados', () => {
  const actions = suggestNextActions(fullDashboard());
  const ids = actions.map((a) => a.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(actions.length <= 3);
});

test('H10. una tarea de prioridad Alta se ordena primero en sugerencias', () => {
  const data = fullDashboard({
    tasks: [
      task({
        id: 'media-today',
        title: 'Media hoy',
        status: 'Pendiente',
        date: TODAY,
        priority: 'Media',
      }),
      task({
        id: 'alta-today',
        title: 'Alta hoy',
        status: 'Pendiente',
        date: TODAY,
        priority: 'Alta',
      }),
    ],
    projects: [],
  });
  const actions = suggestNextActions(data);
  assert.equal(actions[0]?.id, 'task:alta-today');
});

test('H11. fallo de Notion no rompe datos de Google Sheets', () => {
  const sheet = buildMockToday();
  sheet.source = 'google';
  sheet.status = 'ready';
  sheet.notice = null;
  sheet.summary.habits.value = '3/5';
  const merged = mergeTodayWithNotion(sheet, hoyNotionUnavailable('Notion caído'));
  assert.equal(merged.summary.habits.value, '3/5');
  assert.equal(merged.status, 'ready');
  assert.equal(merged.notion.status, 'read-error');
  assert.ok(merged.sources.find((s) => s.id === 'sheet'));
});

test('H12. fallo de Google Sheets no rompe datos de Notion', () => {
  const sheet = buildMockToday();
  sheet.source = 'google';
  sheet.status = 'auth-error';
  sheet.notice = 'No se pudo autenticar con Google.';
  const notion = hoyNotionFromDashboard(fullDashboard({ source: 'notion', status: 'ready' }));
  const merged = mergeTodayWithNotion(sheet, notion);
  assert.equal(merged.status, 'auth-error');
  assert.ok(merged.notion.activeProjects.length > 0);
  assert.equal(merged.notion.status, 'ready');
  const notionSrc = merged.sources.find((s) => s.id === 'notion');
  assert.equal(notionSrc?.mode, 'live');
});

test('H13. no hay ninguna operación de escritura Notion', () => {
  const roots = [join(process.cwd(), 'lib', 'notion'), join(process.cwd(), 'lib', 'data')];
  for (const root of roots) {
    const files = (readdirSync(root, { recursive: true }) as string[])
      .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
      .map((entry) => join(root, entry));
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      assert.doesNotMatch(content, /client\.pages\.(create|update)/);
      assert.doesNotMatch(content, /pages\.create\b/);
      assert.doesNotMatch(content, /pages\.update\b/);
      assert.doesNotMatch(content, /dataSources\.(create|update)/);
    }
  }
  const hoyUi = readFileSync(
    join(process.cwd(), 'components', 'dashboard', 'HoyNotion.tsx'),
    'utf8',
  );
  assert.doesNotMatch(hoyUi, /Checkbox|onChange|toggleHabit|completar/i);
});

test('H14. escritura de hábitos permanece limitada al Sheet DEV', () => {
  const toggle = readFileSync(join(process.cwd(), 'lib', 'habits', 'toggle.ts'), 'utf8');
  assert.match(toggle, /isAllowedSpreadsheetId/);
  assert.match(toggle, /isAuthorizedHabitName/);
  const hoyPage = readFileSync(join(process.cwd(), 'app', '(app)', 'page.tsx'), 'utf8');
  assert.match(hoyPage, /HabitsToday/);
  assert.doesNotMatch(hoyPage, /notion.*write|updateTask/i);
});

test('H15. ningún token o ID interno innecesario llega al cliente', () => {
  const view = buildHoyNotionView(fullDashboard({ source: 'notion', status: 'ready' }));
  const json = JSON.stringify(view);
  assert.doesNotMatch(json, /secret_|NOTION_API_TOKEN|BEGIN PRIVATE KEY|ntn_/i);
  assert.doesNotMatch(json, /data_source|dataSourceId/i);
});

test('H16. DTO final es completamente serializable', () => {
  const sheet = buildMockToday();
  const merged = toPlainTodayData(mergeTodayWithNotion(sheet, buildHoyNotionView(fullDashboard())));
  assert.equal(isJsonPlain(merged), true);
  assert.doesNotThrow(() => JSON.stringify(merged));
  const roundtrip = JSON.parse(JSON.stringify(merged));
  assert.equal(roundtrip.notion.summary.activeProjects, merged.notion.summary.activeProjects);
});

test('H17. pantalla Hoy funciona sin tareas para hoy', () => {
  const view = buildHoyNotionView(
    fullDashboard({
      tasks: [
        task({
          id: 'future',
          title: 'Futura',
          status: 'Pendiente',
          date: '2026-08-01',
        }),
      ],
    }),
  );
  assert.equal(view.dueToday.length, 0);
  assert.equal(view.summary.dueToday, 0);
});

test('H18. pantalla Hoy funciona con datos mock', async () => {
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
  assert.equal(data.source, 'mock');
  assert.ok(data.notion.dueToday.length >= 0);
  assert.ok(data.sources.length >= 3);
  assert.ok(data.calendar);
  assert.equal(isJsonPlain(data), true);
});

test('H19. pantalla Hoy funciona con vista realista (ready Notion + sheet)', () => {
  const sheet = buildMockToday();
  sheet.source = 'google';
  sheet.status = 'ready';
  const notion = buildHoyNotionView(
    fullDashboard({ source: 'notion', status: 'ready', notice: null }),
  );
  const calendar = emptyCalendarTodayPreview({
    source: 'google',
    status: 'empty',
    notice: null,
  });
  const merged = mergeTodayWithNotion(sheet, notion, calendar);
  assert.equal(merged.header.syncLabel, 'Sheet DEV + Notion + Calendar');
  assert.equal(merged.header.syncOk, true);
  assert.ok(merged.notion.activeProjects.length >= 1);
});

test('H20. móvil no tiene scroll horizontal en Hoy Notion', () => {
  const css = readFileSync(
    join(process.cwd(), 'components', 'dashboard', 'HoyNotion.module.scss'),
    'utf8',
  );
  const page = readFileSync(join(process.cwd(), 'app', '(app)', 'page.module.scss'), 'utf8');
  assert.match(css, /min-width:\s*0/);
  assert.match(page, /min-width:\s*0/);
  assert.doesNotMatch(css + page, /overflow-x:\s*scroll/);
});

test('H21. emptyHoyNotionView es seguro y serializable', () => {
  const empty = emptyHoyNotionView();
  assert.equal(empty.dueToday.length, 0);
  assert.equal(isJsonPlain(empty), true);
});

test('H22. vencidas ordenan fecha antigua primero y Alta antes que Media', () => {
  const view = buildHoyNotionView(
    fullDashboard({
      tasks: [
        task({
          id: 'b',
          title: 'Media reciente',
          status: 'Pendiente',
          date: '2026-07-19',
          priority: 'Media',
        }),
        task({
          id: 'a',
          title: 'Alta antigua',
          status: 'Pendiente',
          date: '2026-07-10',
          priority: 'Alta',
        }),
        task({
          id: 'c',
          title: 'Baja misma fecha',
          status: 'Pendiente',
          date: '2026-07-10',
          priority: 'Baja',
        }),
      ],
    }),
  );
  assert.deepEqual(
    view.overdue.map((t) => t.id),
    ['a', 'c', 'b'],
  );
});
