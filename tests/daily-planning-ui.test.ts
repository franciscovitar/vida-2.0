import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectLatestDailyPlanSnapshot } from '@/lib/daily-planning/snapshot';
import { buildDailyPlanningView } from '@/lib/daily-planning/view';
import type {
  DailyPlanningCalendarEvent,
  DailyPlanningContext,
  DailyPlanningTask,
} from '@/types/daily-planning-intelligence';
import type { DailyPlanSnapshotRead } from '@/types/daily-planning-view';

const TODAY = '2026-09-05';
const HEADER = ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'];

function task(overrides: Partial<DailyPlanningTask> = {}): DailyPlanningTask {
  return {
    id: 'task-ref-1',
    title: 'Tarea canónica actual',
    status: 'Pendiente',
    date: null,
    dateKind: 'none',
    priority: 'Media',
    duration: '30 min',
    energy: 'Media',
    project: null,
    area: null,
    projectArea: null,
    blocker: null,
    note: null,
    domain: 'tasks',
    dateSemantics: 'none',
    relationUnavailable: false,
    ...overrides,
  };
}

function event(overrides: Partial<DailyPlanningCalendarEvent> = {}): DailyPlanningCalendarEvent {
  return {
    id: 'calendar-ref-1',
    title: 'Compromiso actual',
    calendarLabel: 'Principal',
    location: null,
    status: 'confirmed',
    transparency: 'opaque',
    blocksTime: true,
    allDay: false,
    multiDay: false,
    startDate: TODAY,
    endDate: TODAY,
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    recurring: false,
    overlaps: false,
    planningRole: 'capacity-block',
    evidence: { provenance: 'unknown', describedDate: null, dateConflict: false },
    ...overrides,
  };
}

function context(overrides: Partial<DailyPlanningContext> = {}): DailyPlanningContext {
  return {
    status: 'ready',
    targetDate: TODAY,
    horizonEnd: '2026-10-05',
    syncedAt: '2026-09-05T15:00:00-03:00',
    timezone: 'America/Argentina/Cordoba',
    sources: {
      tasks: { status: 'ready', available: true, notice: null },
      projects: { status: 'ready', available: true, notice: null },
      milestones: { status: 'ready', available: true, notice: null },
      calendar: { status: 'ready', available: true, notice: null, mode: 'google' },
    },
    tasks: [task(), task({ id: 'task-blocked', title: 'Tarea bloqueada', status: 'Bloqueada', blocker: 'Falta una respuesta' })],
    projects: [],
    calendarEvents: [
      event(),
      event({
        id: 'calendar-marker-1',
        title: 'Evaluación futura',
        blocksTime: false,
        allDay: true,
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: null,
        endTime: null,
        durationMinutes: null,
        planningRole: 'date-marker',
        evidence: { provenance: 'probable', describedDate: null, dateConflict: false },
      }),
    ],
    quality: {
      tasksWithAmbiguousDate: 0,
      tasksMissingDuration: 0,
      tasksMissingPriority: 0,
      blockedTasksWithoutDetail: 0,
      unresolvedTaskRelations: 0,
      projectsWithoutProgressSource: 0,
      calendarDateConflicts: 0,
    },
    ...overrides,
  };
}

function payload(reason: string): string {
  return JSON.stringify({
    must: [{ kind: 'derived', activity: 'Preparar evaluación', reason }],
    should: [{ kind: 'task', ref: 'task-ref-1', reason: 'Pendiente útil y verificable.' }],
    could: [],
    notToday: [],
    suggestedBlocks: [
      {
        start: '16:00',
        end: '16:45',
        item: { kind: 'derived', activity: 'Preparar evaluación', reason },
      },
    ],
    minimumViable: [
      { kind: 'derived', activity: 'Hacer una práctica corta', reason: 'Protege continuidad.' },
    ],
  });
}

test('DPU1. selecciona el último snapshot válido del día', () => {
  const read = selectLatestDailyPlanSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v1:plan:2026-09-05:old',
        TODAY,
        '2026-09-05T12:00:00-03:00',
        payload('Razón anterior.'),
        'chatgpt_project',
        'daily-plan-v1',
      ],
      [
        'vida2:tasks-daily-planning:v1:plan:2026-09-05:new',
        TODAY,
        '2026-09-05T15:00:00-03:00',
        payload('Razón nueva.'),
        'chatgpt_project',
        'daily-plan-v1',
      ],
    ],
    TODAY,
  );

  assert.equal(read.status, 'ready');
  assert.equal(read.snapshot?.generatedAt, '2026-09-05T15:00:00-03:00');
  assert.equal(read.snapshot?.payload.must[0]?.reason, 'Razón nueva.');
});

test('DPU2. fila malformada no se interpreta de forma laxa', () => {
  const malformed = JSON.stringify({
    must: [],
    should: [],
    could: [],
    notToday: [],
    suggestedBlocks: [],
    minimumViable: [],
    unexpected: ['no permitido'],
  });
  const read = selectLatestDailyPlanSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v1:plan:2026-09-05:bad',
        TODAY,
        '2026-09-05T15:00:00-03:00',
        malformed,
        'chatgpt_project',
        'daily-plan-v1',
      ],
    ],
    TODAY,
  );
  assert.equal(read.status, 'invalid');
  assert.equal(read.snapshot, null);
  assert.equal(read.invalidRows, 1);
});

test('DPU3. la vista resuelve refs contra datos actuales y no expone IDs internos', () => {
  const snapshot = selectLatestDailyPlanSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v1:plan:2026-09-05:view',
        TODAY,
        '2026-09-05T15:00:00-03:00',
        payload('Preparación anticipada.'),
        'chatgpt_project',
        'daily-plan-v1',
      ],
    ],
    TODAY,
  );
  const view = buildDailyPlanningView(context(), snapshot);

  assert.equal(view.status, 'ready');
  assert.equal(view.must[0]?.title, 'Preparar evaluación');
  assert.equal(view.should[0]?.title, 'Tarea canónica actual');
  assert.equal(view.fixedCommitments[0]?.title, 'Compromiso actual');
  assert.equal(view.dateMarkers[0]?.note, 'Fecha probable');
  assert.equal(view.blockedTasks[0]?.blocker, 'Falta una respuesta');

  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /task-ref-1|calendar-ref-1|calendar-marker-1/);
  assert.doesNotMatch(serialized, /vida2:tasks-daily-planning:v1:plan:/);
});

test('DPU4. sin snapshot no inventa MUST ni bloques y conserva hechos actuales', () => {
  const empty: DailyPlanSnapshotRead = {
    status: 'empty',
    snapshot: null,
    notice: 'Todavía no hay un plan guardado para hoy.',
    invalidRows: 0,
  };
  const view = buildDailyPlanningView(context(), empty);

  assert.equal(view.status, 'empty');
  assert.deepEqual(view.must, []);
  assert.deepEqual(view.should, []);
  assert.deepEqual(view.suggestedBlocks, []);
  assert.equal(view.fixedCommitments.length, 1);
  assert.equal(view.pendingCount, 2);
});

test('DPU5. una referencia inexistente degrada el plan sin sustitución fuzzy', () => {
  const payloadWithMissingRef = JSON.stringify({
    must: [{ kind: 'task', ref: 'missing-task-id', reason: 'Referencia inexistente.' }],
    should: [],
    could: [],
    notToday: [],
    suggestedBlocks: [],
    minimumViable: [],
  });
  const snapshot = selectLatestDailyPlanSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v1:plan:2026-09-05:missing',
        TODAY,
        '2026-09-05T16:00:00-03:00',
        payloadWithMissingRef,
        'chatgpt_project',
        'daily-plan-v1',
      ],
    ],
    TODAY,
  );
  const view = buildDailyPlanningView(context(), snapshot);

  assert.equal(view.status, 'degraded');
  assert.equal(view.must.length, 0);
  assert.equal(view.quality.unresolvedPlanRefs, 1);
  assert.match(view.notice ?? '', /no pudieron resolverse/);
});
