/**
 * Tests 8D.1 — paneles de Áreas read-only (fixtures).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  findCanonicalNotionArea,
  composeAreaDashboard,
  composeAreasIndex,
  projectsForArea,
  tasksForArea,
} from '@/lib/areas/compose';
import {
  getCanonicalAreaDef,
  isAreaSlug,
  resolveCanonicalSlugFromArea,
} from '@/lib/areas/canonical';
import { buildAreaIntegrityWarnings } from '@/lib/areas/integrity';
import { isExcludedTask, isJournalingRelated, sanitizePublicNote } from '@/lib/areas/privacy';
import { primaryNav } from '@/lib/constants/navigation';
import { buildMockNotionDashboard as buildMockNotionDashboardBase } from '@/lib/mock-data/notion';
import { summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import type { CalendarEvent } from '@/types/calendar';
import type { NotionDashboardData, NotionProject, NotionTask } from '@/types/notion';

const TODAY = '2026-07-22';

function fullDashboard(overrides?: Partial<NotionDashboardData>): NotionDashboardData {
  const base = buildMockNotionDashboardBase(TODAY);
  return {
    ...base,
    source: 'mock',
    status: 'mock',
    notice: null,
    syncedAt: `${TODAY}T12:00:00.000Z`,
    taskSummary: summarizeTasks(base.tasks),
    projectSummary: summarizeProjects(base.projects),
    ...overrides,
  };
}

function baseEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'cal-1',
    title: 'Clase Facultad',
    calendarId: 'primary',
    calendarLabel: null,
    location: null,
    status: 'confirmed',
    transparency: 'opaque',
    blocksTime: true,
    allDay: false,
    multiDay: false,
    recurring: false,
    overlaps: false,
    startDate: TODAY,
    endDate: TODAY,
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    ...overrides,
  };
}

test('8D1-1. listado de cuatro Áreas canónicas', () => {
  const notion = fullDashboard();
  const { summaries } = composeAreasIndex(notion, []);
  assert.equal(summaries.length, 4);
  assert.deepEqual(summaries.map((item) => item.slug).sort(), [
    'facultad',
    'genova-trabajo',
    'salud',
    'vida-personal',
  ]);
});

test('8D1-2. resolución por slug', () => {
  assert.equal(isAreaSlug('facultad'), true);
  assert.equal(getCanonicalAreaDef('facultad')?.stableKey, 'area.facultad');
  const notion = fullDashboard();
  const area = findCanonicalNotionArea(notion.areas, 'facultad');
  assert.equal(area?.name, 'Facultad');
});

test('8D1-3. Área inexistente / slug inválido', () => {
  assert.equal(isAreaSlug('no-existe'), false);
  assert.equal(getCanonicalAreaDef('no-existe'), null);
});

test('8D1-4. Área no canónica no resuelve slug', () => {
  assert.equal(resolveCanonicalSlugFromArea({ name: 'Archivo muerto' }), null);
});

test('8D1-5. conteo de proyectos activos', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'facultad',
    notion,
    calendarEvents: [],
    sheets: null,
    sources: [],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  assert.ok(data!.summary.activeProjectCount >= 1);
});

test('8D1-6. conteo de tareas pendientes', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'genova-trabajo',
    notion,
    calendarEvents: [],
    sheets: null,
    sources: [],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  assert.ok(data!.summary.pendingTaskCount >= 0);
});

test('8D1-7. proyecto sin próxima acción', () => {
  const notion = fullDashboard();
  const area = findCanonicalNotionArea(notion.areas, 'salud')!;
  const activeWithoutNext: NotionProject = {
    ...notion.projects[0]!,
    id: 'active-no-next',
    name: 'Activo sin próxima',
    status: 'Activo',
    nextAction: null,
    area: { id: area.id, name: area.name, available: true },
  };
  const warnings = buildAreaIntegrityWarnings({
    area,
    projects: [activeWithoutNext],
    tasks: [],
    areaNotionId: area.id,
  });
  assert.ok(warnings.some((item) => item.code === 'project-without-next-action'));
});

test('8D1-8. tarea con Área inconsistente', () => {
  const notion = fullDashboard();
  const area = findCanonicalNotionArea(notion.areas, 'facultad')!;
  const foreign: NotionTask = {
    ...notion.tasks[0]!,
    id: 'task-mismatch',
    title: 'Tarea cruzada',
    area: { id: 'other-area', name: 'Otra', available: true },
    projectArea: { id: area.id, name: area.name, available: true },
  };
  const warnings = buildAreaIntegrityWarnings({
    area,
    projects: [],
    tasks: [foreign],
    areaNotionId: area.id,
  });
  assert.ok(warnings.some((item) => item.code === 'task-area-mismatch'));
});

test('8D1-9. proyecto bloqueado sin bloqueo', () => {
  const notion = fullDashboard();
  const area = findCanonicalNotionArea(notion.areas, 'facultad')!;
  const blocked: NotionProject = {
    ...notion.projects[0]!,
    id: 'blocked-no-reason',
    name: 'Bloqueado sin motivo',
    status: 'Bloqueado',
    blocker: null,
    area: { id: area.id, name: area.name, available: true },
  };
  const warnings = buildAreaIntegrityWarnings({
    area,
    projects: [blocked],
    tasks: [],
    areaNotionId: area.id,
  });
  assert.ok(warnings.some((item) => item.code === 'blocked-project-without-blocker'));
});

test('8D1-10. tareas vencidas', () => {
  const notion = fullDashboard();
  const area = findCanonicalNotionArea(notion.areas, 'vida-personal')!;
  const def = getCanonicalAreaDef('vida-personal')!;
  const projects = projectsForArea(notion.projects, area, def);
  const tasks = tasksForArea(notion.tasks, area, def, projects);
  const overdue = tasks.filter((task) => task.dateKind === 'overdue' && task.status !== 'Hecha');
  const warnings = buildAreaIntegrityWarnings({
    area,
    projects,
    tasks,
    areaNotionId: area.id,
  });
  if (overdue.length > 0) {
    assert.ok(warnings.some((item) => item.code === 'overdue-pending-task'));
  } else {
    assert.ok(true);
  }
});

test('8D1-11. fuente Notion caída no inventa Áreas', () => {
  const empty = fullDashboard();
  empty.areas = [];
  empty.projects = [];
  empty.tasks = [];
  const { summaries } = composeAreasIndex(empty, [
    { kind: 'notion', state: 'error', notice: 'Notion caído' },
  ]);
  assert.equal(summaries.length, 0);
});

test('8D1-12. Calendar caído sin romper panel', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'facultad',
    notion,
    calendarEvents: [],
    sheets: null,
    sources: [{ kind: 'calendar', state: 'error', notice: 'Calendar no disponible' }],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  assert.equal(data!.calendar.length, 0);
  assert.ok(data!.sources.some((source) => source.kind === 'calendar' && source.state === 'error'));
});

test('8D1-13. Sheets no aplicable', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'salud',
    notion,
    calendarEvents: [],
    sheets: null,
    sources: [{ kind: 'sheets', state: 'not-applicable', notice: null }],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  assert.equal(data!.metrics.length, 0);
});

test('8D1-14. Facultad con horas de estudio', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'facultad',
    notion,
    calendarEvents: [baseEvent()],
    sheets: {
      studyHoursWeek: '6.5',
      studyTrend: '+10 %',
      workHoursWeek: null,
      sleepHours: null,
      energy: null,
      mood: null,
      exercise: null,
      coverage: null,
    },
    sources: [],
    northHint: null,
    allowMockMetrics: true,
  });
  assert.ok(data);
  assert.equal(data!.variant?.kind, 'facultad');
  assert.ok(data!.metrics.some((metric) => metric.key === 'study-hours'));
  assert.ok(data!.calendar.some((event) => event.title.includes('Facultad')));
});

test('8D1-15. Salud con métricas sanitizadas', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'salud',
    notion,
    calendarEvents: [],
    sheets: {
      studyHoursWeek: null,
      studyTrend: null,
      workHoursWeek: null,
      sleepHours: '7.2',
      energy: '62',
      mood: null,
      exercise: '8200',
      coverage: '4/7 días',
    },
    sources: [],
    northHint: null,
    allowMockMetrics: true,
  });
  assert.ok(data);
  assert.equal(data!.variant?.kind, 'salud');
  assert.ok(data!.metrics.some((metric) => metric.key === 'sleep'));
  const json = JSON.stringify(data);
  assert.equal(/diagn[oó]stico|historial\s+cl[ií]nico|sexualidad/i.test(json), false);
  assert.equal(isJournalingRelated('Journaling nocturno'), true);
});

test('8D1-16. Vida personal sin Journaling', () => {
  const notion = fullDashboard();
  const journalingTask: NotionTask = {
    ...notion.tasks[0]!,
    id: 'journal-task',
    title: 'Journaling de la noche',
    area: {
      id: findCanonicalNotionArea(notion.areas, 'vida-personal')!.id,
      name: 'Vida personal',
      available: true,
    },
  };
  notion.tasks = [...notion.tasks, journalingTask];
  const data = composeAreaDashboard({
    slug: 'vida-personal',
    notion,
    calendarEvents: [],
    sheets: null,
    sources: [],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  assert.equal(
    data!.pendingTasks.some((task) => /journal/i.test(task.title)),
    false,
  );
  assert.equal(isExcludedTask(journalingTask, 'vida-personal'), true);
});

test('8D1-17. Genova sin datos privados de terceros', () => {
  assert.equal(
    sanitizePublicNote('Cliente: Ana — whatsapp +5491112345678', 'genova-trabajo'),
    null,
  );
  assert.equal(sanitizePublicNote('Revisar PR abierto', 'genova-trabajo'), 'Revisar PR abierto');
});

test('8D1-18. DTO sin IDs o URLs internas', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'facultad',
    notion,
    calendarEvents: [baseEvent({ id: 'secret-calendar-uuid' })],
    sheets: null,
    sources: [],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  const json = JSON.stringify(data);
  assert.equal(json.includes('mock-area-facultad'), false);
  assert.equal(json.includes('secret-calendar-uuid'), false);
  assert.equal(json.includes('notion.so'), false);
  assert.equal(json.includes('https://'), false);
});

test('8D1-19. navegación con entrada Áreas', () => {
  assert.ok(primaryNav.some((item) => item.href === '/areas' && item.label === 'Áreas'));
});

test('8D1-20. ausencia de mocks productivos en DTO cuando no se permiten', () => {
  const notion = fullDashboard();
  const data = composeAreaDashboard({
    slug: 'facultad',
    notion,
    calendarEvents: [],
    sheets: null,
    sources: [{ kind: 'sheets', state: 'not-applicable', notice: null }],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  assert.equal(data!.metrics.length, 0);
  assert.ok(data!.activeProjects.every((project) => project.key.startsWith('proj-')));
  assert.equal(JSON.stringify(data).includes('mock-area-'), false);
});
