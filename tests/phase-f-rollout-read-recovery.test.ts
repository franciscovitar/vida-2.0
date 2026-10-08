import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldRenderStagedDailyOrientationV2 } from '@/lib/daily-planning/orientation-rollout';
import { buildDailyOrientationV2View } from '@/lib/daily-planning/orientation-v2-view';
import type { DailyPlanningContext } from '@/types/daily-planning-intelligence';
import type { DailyOrientationSnapshotRead } from '@/types/daily-orientation-v2';

function context(status: DailyPlanningContext['status'] = 'ready'): DailyPlanningContext {
  const available = status === 'ready';
  const source = { status: available ? 'ready' : 'network-error', available, notice: null };
  return {
    status,
    targetDate: '2026-10-08',
    horizonEnd: '2026-11-07',
    syncedAt: '2026-10-08T12:00:00Z',
    timezone: 'America/Argentina/Cordoba',
    sources: {
      tasks: source,
      projects: source,
      milestones: source,
      calendar: { ...source, mode: 'google' },
      assessments: source,
    },
    tasks: [],
    projects: [],
    calendarEvents: [],
    assessments: [],
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

function read(status: DailyOrientationSnapshotRead['status']): DailyOrientationSnapshotRead {
  const hasSnapshot = status === 'ready';
  return {
    status,
    notice:
      status === 'empty'
        ? 'Todavía no hay fila V2 para hoy.'
        : status === 'ready'
          ? null
          : 'Fuente V2 no disponible o inválida.',
    invalidRows: status === 'invalid' ? 1 : 0,
    snapshot: hasSnapshot
      ? {
          id: 'private-fixture',
          planDate: '2026-10-08',
          generatedAt: '2026-10-08T12:00:00Z',
          payload: {
            review: { date: '2026-10-07', headline: 'Revisión', items: [], uncertainties: [] },
            attention: [],
            upcoming: [],
            lifeSignals: [],
            minimum: [],
            notNow: [],
          },
        }
      : null,
  };
}

test('F-REC1. Exact empty transport, without V2 rows, permits staged V1', () => {
  const view = buildDailyOrientationV2View(context(), read('empty'));
  assert.equal(view.readStatus, 'empty');
  assert.equal(view.generatedAt, null);
  assert.equal(shouldRenderStagedDailyOrientationV2(true, view), false);
});

test('F-REC2. Transport outage stays on V2 degraded notice, not silent V1', () => {
  const view = buildDailyOrientationV2View(context(), read('unavailable'));
  assert.equal(view.readStatus, 'unavailable');
  assert.equal(view.status, 'degraded');
  assert.match(view.notice ?? '', /Fuente V2/);
  assert.equal(shouldRenderStagedDailyOrientationV2(true, view), true);
});

test('F-REC3. Invalid V2 records must not masquerade as no saved V2', () => {
  const view = buildDailyOrientationV2View(context(), read('invalid'));
  assert.equal(view.readStatus, 'invalid');
  assert.equal(view.status, 'degraded');
  assert.equal(view.quality.invalidRows, 1);
  assert.equal(shouldRenderStagedDailyOrientationV2(true, view), true);
});

test('F-REC4. A new successful read after outage restores V2 without a cached fake value', () => {
  const outage = buildDailyOrientationV2View(context(), read('unavailable'));
  const recovered = buildDailyOrientationV2View(context(), read('ready'));
  assert.equal(shouldRenderStagedDailyOrientationV2(true, outage), true);
  assert.equal(shouldRenderStagedDailyOrientationV2(true, recovered), true);
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.readStatus, 'ready');
  assert.equal(recovered.review?.headline, 'Revisión');
  assert.doesNotMatch(JSON.stringify(recovered), /private-fixture/);
});

test('F-REC5. Confirmed empty V2 can retain V1 even if other canonical sources are down', () => {
  const view = buildDailyOrientationV2View(context('unavailable'), read('empty'));
  assert.equal(view.readStatus, 'empty');
  assert.equal(shouldRenderStagedDailyOrientationV2(true, view), false);
});

test('F-REC6. V2 reader and UI flag remain distinct permissions', () => {
  const bad = buildDailyOrientationV2View(context(), read('unavailable'));
  assert.equal(shouldRenderStagedDailyOrientationV2(false, bad), false);
  assert.equal(shouldRenderStagedDailyOrientationV2(true, bad), true);
});
