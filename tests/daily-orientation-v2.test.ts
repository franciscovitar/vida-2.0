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
