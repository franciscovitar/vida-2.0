import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadDailyPlanningContextUncached } from '@/lib/daily-planning/context';
import type { NotionReadPort, NotionRawPage } from '@/lib/notion/client';
import type { ProjectsIntelligenceNotionConfig } from '@/lib/notion/config';
import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';
import type { DailyPlanningCalendarEvent } from '@/types/daily-planning-intelligence';

const NOTION_CONFIG: ProjectsIntelligenceNotionConfig = {
  token: 'fixture-token',
  tasksDataSourceId: 'ds-tasks',
  projectsDataSourceId: 'ds-projects',
  milestonesDataSourceId: 'ds-milestones',
};

const CALENDAR_CONFIG: CalendarOAuthConfig = {
  clientId: 'client',
  clientSecret: 'secret',
  refreshToken: 'refresh',
  calendarIds: ['primary'],
  timezone: 'America/Argentina/Cordoba',
};

function titleProp(text: string) {
  return { type: 'title', title: [{ plain_text: text }] };
}
function selectProp(name: string) {
  return { type: 'select', select: { name } };
}
function statusProp(name: string) {
  return { type: 'status', status: { name } };
}
function numberProp(value: number | null) {
  return { type: 'number', number: value };
}
function relationProp(ids: string[]) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}
function dateProp(start: string) {
  return { type: 'date', date: { start, end: null } };
}

const PROJECT: NotionRawPage = {
  id: 'proj-a',
  properties: {
    Proyecto: titleProp('Proyecto A'),
    Estado: selectProp('Activo'),
    'Próxima acción': relationProp(['task-a']),
  },
};

const TASK: NotionRawPage = {
  id: 'task-a',
  properties: {
    Tarea: titleProp('Resolver ejercicio de Redes'),
    Estado: statusProp('Pendiente'),
    Prioridad: selectProp('Alta'),
    'Duración estimada': selectProp('1 h'),
    'Energía requerida': selectProp('Alta'),
    Fecha: dateProp('2026-09-06'),
    Proyecto: relationProp(['proj-a']),
  },
};

const MILESTONES: NotionRawPage[] = [
  {
    id: 'm1',
    properties: {
      Hito: titleProp('Contrato'),
      Proyecto: relationProp(['proj-a']),
      Estado: selectProp('Hecho'),
      Peso: numberProp(25),
    },
  },
  {
    id: 'm2',
    properties: {
      Hito: titleProp('Implementación'),
      Proyecto: relationProp(['proj-a']),
      Estado: selectProp('Pendiente'),
      Peso: numberProp(75),
    },
  },
];

const CALENDAR_EVENT: DailyPlanningCalendarEvent = {
  id: 'calendar-event-1',
  title: 'Clase',
  calendarLabel: 'Principal',
  location: null,
  status: 'confirmed',
  transparency: 'opaque',
  blocksTime: true,
  allDay: false,
  multiDay: false,
  startDate: '2026-09-06',
  endDate: '2026-09-06',
  startTime: '18:00',
  endTime: '20:00',
  durationMinutes: 120,
  recurring: false,
  overlaps: false,
  planningRole: 'capacity-block',
  evidence: { provenance: 'unknown', describedDate: null, dateConflict: false },
};

type PortResult = Awaited<ReturnType<NotionReadPort['queryDataSource']>>;

function fakePort(responses: Record<string, PortResult>): NotionReadPort {
  return {
    async queryDataSource(dataSourceId: string) {
      return responses[dataSourceId] ?? { ok: true, pages: [] };
    },
  };
}

function baseDeps(port: NotionReadPort, calendarResult: { ok: true; events: DailyPlanningCalendarEvent[] } | { ok: false; code: 'read-error' | 'network-error' }) {
  return {
    today: () => '2026-09-05',
    now: () => new Date('2026-09-05T15:00:00.000Z'),
    getNotionDataSource: () => 'notion' as const,
    getNotionConfig: () => ({ ok: true as const, config: NOTION_CONFIG }),
    createNotionPort: () => port,
    getCalendarDataSource: () => 'google' as const,
    getCalendarConfig: () => ({ ok: true as const, config: CALENDAR_CONFIG }),
    getCalendarTimezone: () => CALENDAR_CONFIG.timezone,
    loadCalendar: async () => calendarResult,
  };
}

function goodPort(): NotionReadPort {
  return fakePort({
    'ds-projects': { ok: true, pages: [PROJECT] },
    'ds-tasks': { ok: true, pages: [TASK] },
    'ds-milestones': { ok: true, pages: MILESTONES },
  });
}

test('DP-R1. contexto completo preserva Fecha como ambigua y progreso verificable', async () => {
  const data = await loadDailyPlanningContextUncached(
    baseDeps(goodPort(), { ok: true, events: [CALENDAR_EVENT] }),
  );

  assert.equal(data.status, 'ready');
  assert.equal(data.horizonEnd, '2026-10-05');
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0]?.dateSemantics, 'relevant-date-unspecified');
  assert.equal(data.quality.tasksWithAmbiguousDate, 1);
  assert.equal(data.projects.length, 1);
  assert.deepEqual(data.projects[0]?.progress, {
    measurable: true,
    percent: 25,
    completedWeight: 25,
    totalWeight: 100,
  });
  assert.equal(data.projects[0]?.nextAction?.name, 'Resolver ejercicio de Redes');
  assert.equal(data.calendarEvents[0]?.planningRole, 'capacity-block');
});

test('DP-R2. si Hitos falla, Proyectos y Tareas sobreviven pero progress es unknown/null', async () => {
  const port = fakePort({
    'ds-projects': { ok: true, pages: [PROJECT] },
    'ds-tasks': { ok: true, pages: [TASK] },
    'ds-milestones': { ok: false, code: 'network-error' },
  });
  const data = await loadDailyPlanningContextUncached(
    baseDeps(port, { ok: true, events: [CALENDAR_EVENT] }),
  );

  assert.equal(data.status, 'degraded');
  assert.equal(data.sources.milestones.available, false);
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0]?.progress, null);
  assert.equal(data.projects[0]?.milestoneCount, null);
  assert.equal(data.quality.projectsWithoutProgressSource, 1);
  assert.equal(data.tasks.length, 1);
});

test('DP-R3. si Calendar falla, backlog real permanece y no se inyectan eventos mock', async () => {
  const data = await loadDailyPlanningContextUncached(
    baseDeps(goodPort(), { ok: false, code: 'network-error' }),
  );

  assert.equal(data.status, 'degraded');
  assert.equal(data.sources.calendar.status, 'network-error');
  assert.equal(data.sources.calendar.available, false);
  assert.deepEqual(data.calendarEvents, []);
  assert.equal(data.tasks[0]?.title, 'Resolver ejercicio de Redes');
  assert.equal(data.projects[0]?.name, 'Proyecto A');
});

test('DP-R4. si Tareas falla, Proyectos/Calendar sobreviven y próxima acción queda no resoluble', async () => {
  const port = fakePort({
    'ds-projects': { ok: true, pages: [PROJECT] },
    'ds-tasks': { ok: false, code: 'permission-error' },
    'ds-milestones': { ok: true, pages: MILESTONES },
  });
  const data = await loadDailyPlanningContextUncached(
    baseDeps(port, { ok: true, events: [CALENDAR_EVENT] }),
  );

  assert.equal(data.status, 'degraded');
  assert.equal(data.sources.tasks.status, 'permission-error');
  assert.deepEqual(data.tasks, []);
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0]?.nextAction?.available, false);
  assert.equal(data.calendarEvents.length, 1);
});

test('DP-R5. Estado de tarea inválido falla cerrado; nunca se fabrica Pendiente', async () => {
  const invalidTask: NotionRawPage = {
    id: 'task-bad',
    properties: {
      Tarea: titleProp('Tarea ambigua'),
      Estado: statusProp('Inventado'),
    },
  };
  const port = fakePort({
    'ds-projects': { ok: true, pages: [PROJECT] },
    'ds-tasks': { ok: true, pages: [invalidTask] },
    'ds-milestones': { ok: true, pages: MILESTONES },
  });
  const data = await loadDailyPlanningContextUncached(
    baseDeps(port, { ok: true, events: [] }),
  );

  assert.equal(data.sources.tasks.status, 'missing-property');
  assert.equal(data.sources.tasks.available, false);
  assert.deepEqual(data.tasks, []);
  assert.ok(!JSON.stringify(data).includes('Tarea ambigua'));
});

test('DP-R6. Hecha y Algún día no entran al contexto operativo diario', async () => {
  const done: NotionRawPage = {
    id: 'done',
    properties: { Tarea: titleProp('Ya hecha'), Estado: statusProp('Hecha') },
  };
  const someday: NotionRawPage = {
    id: 'someday',
    properties: { Tarea: titleProp('Tal vez algún día'), Estado: statusProp('Algún día') },
  };
  const port = fakePort({
    'ds-projects': { ok: true, pages: [] },
    'ds-tasks': { ok: true, pages: [done, someday] },
    'ds-milestones': { ok: true, pages: [] },
  });
  const data = await loadDailyPlanningContextUncached(
    baseDeps(port, { ok: true, events: [] }),
  );

  assert.deepEqual(data.tasks, []);
  assert.equal(data.sources.tasks.status, 'ready');
});

test('DP-R7. fuentes personales en modo mock no generan contexto personal simulado', async () => {
  const data = await loadDailyPlanningContextUncached({
    today: () => '2026-09-05',
    now: () => new Date('2026-09-05T15:00:00.000Z'),
    getNotionDataSource: () => 'mock',
    getNotionConfig: () => ({ ok: false, reason: 'not-configured' }),
    createNotionPort: () => goodPort(),
    getCalendarDataSource: () => 'mock',
    getCalendarConfig: () => ({ ok: false, reason: 'not-configured' }),
    getCalendarTimezone: () => CALENDAR_CONFIG.timezone,
    loadCalendar: async () => ({ ok: true, events: [CALENDAR_EVENT] }),
  });

  assert.equal(data.status, 'unavailable');
  assert.deepEqual(data.tasks, []);
  assert.deepEqual(data.projects, []);
  assert.deepEqual(data.calendarEvents, []);
});
