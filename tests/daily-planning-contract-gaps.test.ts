import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adaptDailyPlanningCalendarEvent } from '@/lib/calendar/planning-adapters';
import { loadDailyPlanningContextUncached } from '@/lib/daily-planning/context';
import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';
import type { NotionReadPort, NotionRawPage } from '@/lib/notion/client';
import type { ProjectsIntelligenceNotionConfig } from '@/lib/notion/config';

const TZ = 'America/Argentina/Cordoba';

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
  timezone: TZ,
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

const PROJECT: NotionRawPage = {
  id: 'proj-a',
  properties: {
    Proyecto: titleProp('Proyecto A'),
    Estado: selectProp('Activo'),
  },
};

const TASK_WITHOUT_DATE: NotionRawPage = {
  id: 'task-a',
  properties: {
    Tarea: titleProp('Llevar ropa al lavadero'),
    Estado: statusProp('Pendiente'),
    Prioridad: selectProp('Media'),
    'Duración estimada': selectProp('30 min'),
    'Energía requerida': selectProp('Baja'),
  },
};

type PortResult = Awaited<ReturnType<NotionReadPort['queryDataSource']>>;

function baseDeps(port: NotionReadPort) {
  return {
    today: () => '2026-09-05',
    now: () => new Date('2026-09-05T15:00:00.000Z'),
    getNotionDataSource: () => 'notion' as const,
    getNotionConfig: () => ({ ok: true as const, config: NOTION_CONFIG }),
    createNotionPort: () => port,
    getCalendarDataSource: () => 'google' as const,
    getCalendarConfig: () => ({ ok: true as const, config: CALENDAR_CONFIG }),
    getCalendarTimezone: () => TZ,
    loadCalendar: async () => ({ ok: true as const, events: [] }),
  };
}

function portWith(responses: Record<string, PortResult>): NotionReadPort {
  return {
    async queryDataSource(dataSourceId: string) {
      return responses[dataSourceId] ?? { ok: true, pages: [] };
    },
  };
}

test('DP-G1. tarea sin Fecha conserva semántica none y nunca se promueve a deadline', async () => {
  const data = await loadDailyPlanningContextUncached(
    baseDeps(
      portWith({
        'ds-tasks': { ok: true, pages: [TASK_WITHOUT_DATE] },
        'ds-projects': { ok: true, pages: [PROJECT] },
        'ds-milestones': { ok: true, pages: [] },
      }),
    ),
  );

  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0]?.date, null);
  assert.equal(data.tasks[0]?.dateSemantics, 'none');
  assert.equal(data.quality.tasksWithAmbiguousDate, 0);
});

test('DP-G2. parcial futuro all-day queda disponible como señal anticipable sin bloquear capacidad', () => {
  const event = adaptDailyPlanningCalendarEvent(
    {
      id: 'tpa-exam',
      summary: 'Parcial – TPA',
      description: 'Fecha tomada del cronograma.',
      status: 'confirmed',
      transparency: 'transparent',
      start: { date: '2026-09-08' },
      end: { date: '2026-09-09' },
    },
    'primary',
    TZ,
    'Principal',
  );

  assert.ok(event);
  assert.equal(event.title, 'Parcial – TPA');
  assert.equal(event.startDate, '2026-09-08');
  assert.equal(event.planningRole, 'date-marker');
  assert.equal(event.blocksTime, false);
  assert.equal(event.durationMinutes, null);
  assert.equal(event.evidence.provenance, 'schedule-derived');
});

test('DP-G3. excepción inesperada en Hitos queda localizada y no derriba Tasks, Projects ni Calendar', async () => {
  const port: NotionReadPort = {
    async queryDataSource(dataSourceId: string) {
      if (dataSourceId === 'ds-milestones') {
        throw new Error('unexpected milestone transport failure');
      }
      if (dataSourceId === 'ds-projects') return { ok: true, pages: [PROJECT] };
      if (dataSourceId === 'ds-tasks') return { ok: true, pages: [TASK_WITHOUT_DATE] };
      return { ok: true, pages: [] };
    },
  };

  const data = await loadDailyPlanningContextUncached(baseDeps(port));

  assert.equal(data.status, 'degraded');
  assert.equal(data.sources.tasks.available, true);
  assert.equal(data.sources.projects.available, true);
  assert.equal(data.sources.milestones.status, 'read-error');
  assert.equal(data.sources.milestones.available, false);
  assert.equal(data.sources.calendar.available, true);
  assert.equal(data.tasks.length, 1);
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0]?.progress, null);
  assert.equal(data.projects[0]?.milestoneCount, null);
  assert.deepEqual(data.calendarEvents, []);
});
