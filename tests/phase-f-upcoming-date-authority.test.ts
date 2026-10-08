import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDailyOrientationV2View } from '@/lib/daily-planning/orientation-v2-view';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';
import type { DailyPlanningContext } from '@/types/daily-planning-intelligence';
import type {
  DailyOrientationSnapshotRead,
  DailyOrientationUpcomingItem,
} from '@/types/daily-orientation-v2';

function fixture(items: DailyOrientationUpcomingItem[]): DailyOrientationSnapshotRead {
  return {
    status: 'ready',
    notice: null,
    invalidRows: 0,
    snapshot: {
      id: 'private-snapshot-fixture',
      planDate: '2026-10-08',
      generatedAt: '2026-10-08T12:00:00Z',
      payload: {
        review: { date: '2026-10-07', headline: 'Review', items: [], uncertainties: [] },
        attention: [],
        upcoming: items,
        lifeSignals: [],
        minimum: [],
        notNow: [],
      },
    },
  };
}

function item(
  kind: DailyOrientationUpcomingItem['kind'],
  ref: string | null,
  date: string,
  dateType: DailyOrientationUpcomingItem['dateType'] = 'unknown',
): DailyOrientationUpcomingItem {
  return { kind, ref, date, dateType, title: 'Fecha de ejemplo', reason: 'Revisar.' };
}

function syntheticAssessment(id: string, assessmentDate: string): AssessmentProgressSnapshot {
  return {
    snapshotId: `fixture-${id}`,
    assessmentId: id,
    subjectId: 'dsi',
    assessmentDate,
    generatedAt: '2026-10-08T12:00:00Z',
    payload: {
      name: 'Evaluación sintética',
      type: 'partial',
      status: 'active',
      progressPercent: null,
      progressConfidence: 'low',
      readinessBand: 'unknown',
      remainingMinutesLow: null,
      remainingMinutesHigh: null,
      etaConfidence: 'low',
      criticalGaps: [],
      nextBestActivity: null,
      scopeComplete: false,
      evidenceCount: 0,
    },
  };
}

function context(): DailyPlanningContext {
  return {
    status: 'ready',
    targetDate: '2026-10-08',
    horizonEnd: '2026-11-07',
    syncedAt: '2026-10-08T12:00:00Z',
    timezone: 'America/Argentina/Cordoba',
    sources: {
      tasks: { status: 'ready', available: true, notice: null },
      projects: { status: 'ready', available: true, notice: null },
      milestones: { status: 'ready', available: true, notice: null },
      calendar: { status: 'ready', available: true, notice: null, mode: 'google' },
      assessments: { status: 'ready', available: true, notice: null },
    },
    tasks: [
      {
        id: 'task-1',
        date: '2026-10-12',
        dateSemantics: 'target',
      },
    ],
    projects: [
      {
        id: 'project-1',
        dueDate: '2026-10-22',
        reviewDate: '2026-10-15',
      },
    ],
    calendarEvents: [
      {
        id: 'event-1',
        startDate: '2026-10-12',
        endDate: '2026-10-12',
      },
      {
        id: 'event-multi',
        startDate: '2026-10-11',
        endDate: '2026-10-13',
      },
    ],
    assessments: [syntheticAssessment('dsi-2026-p3', '2026-11-07')],
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

test('F-DATE1. moved Calendar event no longer shows the stale snapshot date', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([item('calendar', 'event-1', '2026-10-09', 'event')]),
  );
  assert.equal(view.status, 'degraded');
  assert.equal(view.upcoming.length, 0);
  assert.equal(view.quality.dateConflicts, 1);
  assert.equal(view.quality.unresolvedRefs, 0);
  assert.match(view.notice ?? '', /fecha\(s\)/);
  assert.doesNotMatch(JSON.stringify(view), /event-1|2026-10-09/);
});

test('F-DATE2. actual Calendar date and a date within a real multi-day event remain', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([
      item('calendar', 'event-1', '2026-10-12', 'event'),
      item('calendar', 'event-multi', '2026-10-12', 'event'),
    ]),
  );
  assert.equal(view.status, 'ready');
  assert.equal(view.quality.dateConflicts, 0);
  assert.deepEqual(
    view.upcoming.map((upcoming) => upcoming.date),
    ['2026-10-12', '2026-10-12'],
  );
});

test('F-DATE3. rescheduled assessment date is withheld, live assessment date stays', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([
      item('assessment', 'dsi-2026-p3', '2026-11-01', 'assessment'),
      item('assessment', 'dsi-2026-p3', '2026-11-07', 'assessment'),
    ]),
  );
  assert.equal(view.status, 'degraded');
  assert.equal(view.quality.dateConflicts, 1);
  assert.deepEqual(
    view.upcoming.map((upcoming) => upcoming.date),
    ['2026-11-07'],
  );
});

test('F-DATE4. ambiguous subject id cannot authorize either examination date', () => {
  const contextWithTwoExams = context();
  contextWithTwoExams.assessments = [
    syntheticAssessment('dsi-2026-p3', '2026-11-07'),
    syntheticAssessment('dsi-2026-rec', '2026-11-15'),
  ];
  const view = buildDailyOrientationV2View(
    contextWithTwoExams,
    fixture([item('assessment', 'dsi', '2026-11-07', 'assessment')]),
  );
  assert.equal(view.quality.dateConflicts, 1);
  assert.equal(view.upcoming.length, 0);
});

test('F-DATE5. task date and date semantics must agree before a deadline is asserted', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([
      item('task', 'task-1', '2026-10-12', 'deadline'),
      item('task', 'task-1', '2026-10-12', 'target'),
      item('task', 'task-1', '2026-10-09', 'target'),
    ]),
  );
  assert.equal(view.quality.dateConflicts, 2);
  assert.deepEqual(
    view.upcoming.map((upcoming) => upcoming.dateType),
    ['target'],
  );
});

test('F-DATE6. project review and deadline check different canonical fields', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([
      item('project', 'project-1', '2026-10-22', 'review'),
      item('project', 'project-1', '2026-10-15', 'review'),
      item('project', 'project-1', '2026-10-22', 'deadline'),
    ]),
  );
  assert.equal(view.quality.dateConflicts, 1);
  assert.deepEqual(
    view.upcoming.map((upcoming) => upcoming.date),
    ['2026-10-15', '2026-10-22'],
  );
});

test('F-DATE7. a source outage suppresses stale refs separately from date conflicts', () => {
  const offline = context();
  offline.status = 'degraded';
  offline.sources.calendar = {
    status: 'network-error',
    available: false,
    notice: 'Source unavailable',
    mode: 'google',
  };
  const view = buildDailyOrientationV2View(
    offline,
    fixture([item('calendar', 'event-1', '2026-10-09', 'event')]),
  );
  assert.equal(view.quality.unresolvedRefs, 1);
  assert.equal(view.quality.dateConflicts, 0);
  assert.deepEqual(view.upcoming, []);
});

test('F-DATE8. a missing current date cannot certify a former event date', () => {
  const missing = context();
  missing.calendarEvents = [{ id: 'event-1' }] as unknown as DailyPlanningContext['calendarEvents'];
  const view = buildDailyOrientationV2View(
    missing,
    fixture([item('calendar', 'event-1', '2026-10-09', 'event')]),
  );
  assert.equal(view.quality.dateConflicts, 1);
  assert.deepEqual(view.upcoming, []);
});

test('F-DATE9. null-ref suggestions remain labeled by their snapshot and never reveal IDs', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([item('calendar', null, '2026-10-09', 'unknown')]),
  );
  assert.equal(view.quality.dateConflicts, 0);
  assert.equal(view.upcoming.length, 1);
  assert.doesNotMatch(JSON.stringify(view), /private-snapshot-fixture/);
});

test('F-DATE10. a Calendar event is not evidence of an official deadline', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([item('calendar', 'event-1', '2026-10-12', 'deadline')]),
  );
  assert.equal(view.quality.dateConflicts, 1);
  assert.deepEqual(view.upcoming, []);
});

test('F-DATE11. a matching exam date cannot be mislabeled as a task deadline', () => {
  const view = buildDailyOrientationV2View(
    context(),
    fixture([item('assessment', 'dsi-2026-p3', '2026-11-07', 'deadline')]),
  );
  assert.equal(view.quality.dateConflicts, 1);
  assert.deepEqual(view.upcoming, []);
});

test('F-DATE12. a cancelled Calendar event never certifies a current commitment', () => {
  const cancelled = context();
  cancelled.calendarEvents = cancelled.calendarEvents.map((event) =>
    event.id === 'event-1' ? { ...event, status: 'cancelled' } : event,
  );
  const view = buildDailyOrientationV2View(
    cancelled,
    fixture([item('calendar', 'event-1', '2026-10-12', 'event')]),
  );
  assert.equal(view.quality.dateConflicts, 1);
  assert.deepEqual(view.upcoming, []);
});
