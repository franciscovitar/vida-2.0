import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectLatestDailyOrientationSnapshot } from '@/lib/daily-planning/orientation-v2';
import { buildDailyOrientationV2View } from '@/lib/daily-planning/orientation-v2-view';
import type { DailyPlanningContext } from '@/types/daily-planning-intelligence';

const TODAY = '2026-10-07';
const HEADER = ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'];

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    review: {
      date: '2026-10-06',
      headline: 'Hubo estudio, entrenamiento y ocio sin desplazamiento visible.',
      items: [
        {
          domain: 'university',
          activity: 'DSI',
          evidenceState: 'VERIFIED',
          progressEffect: 'verified',
          summary: 'Hubo evidencia fresca de avance.',
        },
      ],
      uncertainties: [],
    },
    attention: [
      {
        domain: 'university',
        targetKind: 'task',
        ref: 'task-1',
        title: 'IOP',
        recommendation: 'Darle un bloque acotado hoy.',
        why: 'Tiene menos evidencia fresca.',
        confidence: 'Media',
        nextAction: 'Resolver un ejercicio fresco.',
      },
    ],
    upcoming: [
      {
        kind: 'project',
        ref: 'project-1',
        title: 'Proyecto A',
        date: '2026-10-10',
        dateType: 'review',
        reason: 'Revisar si vuelve a competir.',
      },
    ],
    lifeSignals: [
      {
        kind: 'leisure',
        level: 'normal',
        summary: 'El ocio funcionó como recuperación.',
        confidence: 'Media',
      },
    ],
    minimum: [{ domain: 'tasks', title: 'Tarea mínima', why: 'Protege continuidad.', ref: null }],
    notNow: [{ domain: 'projects', title: 'Proyecto B', why: 'Puede esperar.', ref: null }],
    ...overrides,
  });
}

function context(): DailyPlanningContext {
  return {
    status: 'ready',
    targetDate: TODAY,
    horizonEnd: '2026-11-06',
    syncedAt: '2026-10-07T08:00:00-03:00',
    timezone: 'America/Argentina/Cordoba',
    sources: {
      tasks: { status: 'ready', available: true, notice: null },
      projects: { status: 'ready', available: true, notice: null },
      milestones: { status: 'ready', available: true, notice: null },
      calendar: { status: 'ready', available: true, notice: null, mode: 'google' },
    },
    tasks: [
      {
        id: 'task-1',
        title: 'Resolver IOP',
        status: 'Pendiente',
        date: null,
        dateKind: 'none',
        priority: null,
        duration: null,
        energy: null,
        project: null,
        area: null,
        projectArea: null,
        blocker: null,
        note: null,
        domain: 'learning',
        dateSemantics: 'none',
        relationUnavailable: false,
      },
    ],
    projects: [
      {
        id: 'project-1',
        name: 'Proyecto A',
        status: 'Activo',
        type: null,
        nextAction: null,
        lastAdvance: null,
        blocker: null,
        dueDate: null,
        reviewDate: '2026-10-10',
        progress: null,
        milestoneCount: null,
      },
    ],
    calendarEvents: [],
    assessments: [],
    quality: {
      tasksWithAmbiguousDate: 0,
      tasksMissingDuration: 1,
      tasksMissingPriority: 1,
      blockedTasksWithoutDetail: 0,
      unresolvedTaskRelations: 0,
      projectsWithoutProgressSource: 1,
      calendarDateConflicts: 0,
    },
  };
}

test('V2-O1 parses only exact daily-orientation-v2 rows and ignores V1 rows', () => {
  const read = selectLatestDailyOrientationSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v1:plan:2026-10-07:morning-v1',
        TODAY,
        '2026-10-07T07:00:00-03:00',
        '{}',
        'chatgpt_project',
        'daily-plan-v1',
      ],
      [
        'vida2:tasks-daily-planning:v2:orientation:2026-10-07:ok',
        TODAY,
        '2026-10-07T08:00:00-03:00',
        payload(),
        'chatgpt_project',
        'daily-orientation-v2',
      ],
    ],
    TODAY,
  );

  assert.equal(read.status, 'ready');
  assert.equal(read.invalidRows, 0);
  assert.equal(read.snapshot?.payload.review.date, '2026-10-06');
});

test('V2-O2 rejects extra payload keys rather than interpreting them loosely', () => {
  const malformed = JSON.parse(payload()) as Record<string, unknown>;
  malformed.secretExtra = 'not allowed';
  const read = selectLatestDailyOrientationSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v2:orientation:2026-10-07:bad',
        TODAY,
        '2026-10-07T08:00:00-03:00',
        JSON.stringify(malformed),
        'chatgpt_project',
        'daily-orientation-v2',
      ],
    ],
    TODAY,
  );

  assert.equal(read.status, 'invalid');
  assert.equal(read.snapshot, null);
  assert.equal(read.invalidRows, 1);
});

test('V2-O3 browser view strips canonical refs and Snapshot ID', () => {
  const read = selectLatestDailyOrientationSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v2:orientation:2026-10-07:view',
        TODAY,
        '2026-10-07T08:00:00-03:00',
        payload(),
        'chatgpt_project',
        'daily-orientation-v2',
      ],
    ],
    TODAY,
  );
  const view = buildDailyOrientationV2View(context(), read);
  const serialized = JSON.stringify(view);

  assert.equal(view.status, 'ready');
  assert.equal(view.attention[0]?.title, 'IOP');
  assert.equal(view.upcoming[0]?.title, 'Proyecto A');
  assert.doesNotMatch(serialized, /task-1|project-1|vida2:tasks-daily-planning:v2:orientation/);
});

test('V2-O4 unresolved internal ref degrades and is not fuzzy-substituted', () => {
  const decoded = JSON.parse(payload()) as {
    attention: Array<Record<string, unknown>>;
  };
  decoded.attention[0]!.ref = 'missing-task';
  const read = selectLatestDailyOrientationSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v2:orientation:2026-10-07:missing',
        TODAY,
        '2026-10-07T08:00:00-03:00',
        JSON.stringify(decoded),
        'chatgpt_project',
        'daily-orientation-v2',
      ],
    ],
    TODAY,
  );
  const view = buildDailyOrientationV2View(context(), read);

  assert.equal(view.status, 'degraded');
  assert.equal(view.attention.length, 0);
  assert.equal(view.quality.unresolvedRefs, 1);
});

test('V2-O5 an empty valid attention array is allowed: no-change is first class', () => {
  const decoded = JSON.parse(payload()) as Record<string, unknown>;
  decoded.attention = [];
  const read = selectLatestDailyOrientationSnapshot(
    [
      HEADER,
      [
        'vida2:tasks-daily-planning:v2:orientation:2026-10-07:no-change',
        TODAY,
        '2026-10-07T08:00:00-03:00',
        JSON.stringify(decoded),
        'chatgpt_project',
        'daily-orientation-v2',
      ],
    ],
    TODAY,
  );
  const view = buildDailyOrientationV2View(context(), read);

  assert.equal(view.status, 'ready');
  assert.deepEqual(view.attention, []);
});

function v2Row(encodedPayload: string, targetDate = TODAY): unknown[] {
  return [
    `vida2:tasks-daily-planning:v2:orientation:${targetDate}:fixture`,
    targetDate,
    '2026-10-07T08:00:00-03:00',
    encodedPayload,
    'chatgpt_project',
    'daily-orientation-v2',
  ];
}

test('F-OR1. Impossible target date is invalid before inspecting source rows', () => {
  const read = selectLatestDailyOrientationSnapshot([HEADER], '2026-02-30');
  assert.equal(read.status, 'invalid');
  assert.equal(read.snapshot, null);
});

test('F-OR2. Impossible review date invalidates the orientation row', () => {
  const decoded = JSON.parse(payload()) as { review: { date: string } };
  decoded.review.date = '2026-02-30';
  const read = selectLatestDailyOrientationSnapshot(
    [HEADER, v2Row(JSON.stringify(decoded))],
    TODAY,
  );
  assert.equal(read.status, 'invalid');
  assert.equal(read.invalidRows, 1);
  assert.equal(read.snapshot, null);
});

test('F-OR3. Impossible upcoming date never becomes a verified commitment', () => {
  const decoded = JSON.parse(payload()) as { upcoming: Array<{ date: string }> };
  decoded.upcoming[0]!.date = '2025-02-29';
  const read = selectLatestDailyOrientationSnapshot(
    [HEADER, v2Row(JSON.stringify(decoded))],
    TODAY,
  );
  assert.equal(read.status, 'invalid');
  assert.equal(read.snapshot, null);
});

test('F-OR4. Actual leap days remain valid in both review and upcoming', () => {
  const decoded = JSON.parse(payload()) as {
    review: { date: string };
    upcoming: Array<{ date: string }>;
  };
  decoded.review.date = '2024-02-29';
  decoded.upcoming[0]!.date = '2024-02-29';
  const read = selectLatestDailyOrientationSnapshot(
    [HEADER, v2Row(JSON.stringify(decoded))],
    TODAY,
  );
  assert.equal(read.status, 'ready');
  assert.equal(read.snapshot?.payload.review.date, '2024-02-29');
  assert.equal(read.snapshot?.payload.upcoming[0]?.date, '2024-02-29');
});

test('F-OR5. Unexpected raw Journal fields are rejected at the review boundary', () => {
  const decoded = JSON.parse(payload()) as { review: Record<string, unknown> };
  decoded.review.journalRawBody = 'fixture-private-journal-text';
  const read = selectLatestDailyOrientationSnapshot(
    [HEADER, v2Row(JSON.stringify(decoded))],
    TODAY,
  );
  assert.equal(read.status, 'invalid');
  assert.equal(read.snapshot, null);
});

test('F-OR6. Degraded sources cannot expose stale referenced advice in the browser DTO', () => {
  const read = selectLatestDailyOrientationSnapshot([HEADER, v2Row(payload())], TODAY);
  const degraded = context();
  degraded.status = 'degraded';
  degraded.sources.tasks = {
    status: 'network-error',
    available: false,
    notice: 'Tareas no disponibles.',
  };
  degraded.sources.projects = {
    status: 'network-error',
    available: false,
    notice: 'Proyectos no disponibles.',
  };
  degraded.tasks = [];
  degraded.projects = [];
  const view = buildDailyOrientationV2View(degraded, read);
  const serialized = JSON.stringify(view);

  assert.equal(view.status, 'degraded');
  assert.deepEqual(view.attention, []);
  assert.deepEqual(view.upcoming, []);
  assert.equal(view.quality.unresolvedRefs, 2);
  assert.doesNotMatch(serialized, /task-1|project-1|fixture-private-journal-text/);
});
