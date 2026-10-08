import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDailyOrientationV2View } from '@/lib/daily-planning/orientation-v2-view';
import type { DailyPlanningContext } from '@/types/daily-planning-intelligence';
import type { DailyOrientationSnapshotRead } from '@/types/daily-orientation-v2';

const snapshot: DailyOrientationSnapshotRead = {
  status: 'ready',
  notice: null,
  invalidRows: 0,
  snapshot: {
    id: 'snapshot-private-fixture',
    planDate: '2026-10-08',
    generatedAt: '2026-10-08T12:00:00Z',
    payload: {
      review: { date: '2026-10-07', headline: 'Short review', items: [], uncertainties: [] },
      attention: [
        {
          domain: 'tasks',
          targetKind: 'task',
          ref: 'task-stale',
          title: 'Task attention',
          recommendation: 'Revisit task',
          why: 'Prior context',
          confidence: 'Media',
          nextAction: null,
        },
        {
          domain: 'projects',
          targetKind: 'project',
          ref: 'project-stale',
          title: 'Project attention',
          recommendation: 'Revisit project',
          why: 'Prior context',
          confidence: 'Media',
          nextAction: null,
        },
        {
          domain: 'university',
          targetKind: 'assessment',
          ref: 'assessment-stale',
          title: 'Assessment attention',
          recommendation: 'Review exam',
          why: 'Prior context',
          confidence: 'Media',
          nextAction: null,
        },
      ],
      upcoming: [
        {
          kind: 'calendar',
          ref: 'calendar-stale',
          title: 'Old calendar',
          date: '2026-10-09',
          dateType: 'event',
          reason: 'Prior context',
        },
      ],
      lifeSignals: [],
      minimum: [{ domain: 'tasks', title: 'Old minimum', ref: 'task-stale', why: 'Prior context' }],
      notNow: [
        { domain: 'projects', title: 'Old deferral', ref: 'project-stale', why: 'Prior context' },
      ],
    },
  },
};

function context(available: boolean): DailyPlanningContext {
  const source = {
    status: available ? 'ready' : 'network-error',
    available,
    notice: available ? null : 'Source unavailable',
  };
  return {
    status: available ? 'ready' : 'degraded',
    targetDate: '2026-10-08',
    horizonEnd: '2026-11-07',
    syncedAt: '2026-10-08T12:00:00Z',
    timezone: 'America/Argentina/Cordoba',
    sources: {
      tasks: source,
      projects: source,
      milestones: source,
      calendar: { ...source, mode: 'google' },
      assessments: { ...source, status: available ? 'ready' : 'unavailable' },
    },
    // Deliberately retain stale objects in memory during an outage.
    tasks: [{ id: 'task-stale' }],
    projects: [{ id: 'project-stale' }],
    calendarEvents: [{ id: 'calendar-stale', startDate: '2026-10-09', endDate: '2026-10-09' }],
    assessments: [{ assessmentId: 'assessment-stale', subjectId: 'subject-stale' }],
    quality: {
      tasksWithAmbiguousDate: 0,
      tasksMissingDuration: 0,
      tasksMissingPriority: 0,
      blockedTasksWithoutDetail: 0,
      unresolvedTaskRelations: 0,
      projectsWithoutProgressSource: 0,
      calendarDateConflicts: 0,
    },
  } as unknown as DailyPlanningContext;
}

test('F-SOURCE-1. Unavailable sources suppress all stale referenced orientation items', () => {
  const view = buildDailyOrientationV2View(context(false), snapshot);
  const serialized = JSON.stringify(view);

  assert.equal(view.status, 'degraded');
  assert.deepEqual(view.attention, []);
  assert.deepEqual(view.upcoming, []);
  assert.deepEqual(view.minimum, []);
  assert.deepEqual(view.notNow, []);
  assert.equal(view.quality.unresolvedRefs, 6);
  assert.doesNotMatch(serialized, /task-stale|project-stale|assessment-stale|calendar-stale/);
  assert.doesNotMatch(serialized, /Old calendar|Old minimum|Old deferral/);
});

test('F-SOURCE-2. Verified available sources still resolve the same refs', () => {
  const view = buildDailyOrientationV2View(context(true), snapshot);
  assert.equal(view.status, 'ready');
  assert.equal(view.quality.unresolvedRefs, 0);
  assert.equal(view.attention.length, 3);
  assert.equal(view.upcoming.length, 1);
  assert.equal(view.minimum.length, 1);
  assert.equal(view.notNow.length, 1);
});

test('F-SOURCE-3. One failed source does not erase other verified reference kinds', () => {
  const partial = context(true);
  partial.status = 'degraded';
  partial.sources.tasks = { status: 'network-error', available: false, notice: 'Unavailable' };
  const view = buildDailyOrientationV2View(partial, snapshot);

  assert.equal(view.status, 'degraded');
  assert.equal(view.quality.unresolvedRefs, 2);
  assert.deepEqual(
    view.attention.map((item) => item.targetKind),
    ['project', 'assessment'],
  );
  assert.deepEqual(view.minimum, []);
  assert.equal(view.upcoming.length, 1);
  assert.equal(view.notNow.length, 1);
});
