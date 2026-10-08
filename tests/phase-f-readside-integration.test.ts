import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isDailyPlanningV2UiEnabled, isTaskDateSemanticsV2Enabled, isTodayCockpitV2UiEnabled } from '@/lib/daily-planning/v2-config';
import { isLearningHubV2Enabled } from '@/lib/learning/v2-config';
import { deriveTaskDateAttention, deriveTaskDateSemantics, deriveTaskDateState } from '@/lib/notion/task-date-semantics';
import { parsePlanningCivilDay } from '@/lib/planning/civil-day';
import { selectWeekTasks } from '@/lib/planning/overview';
import { isProjectsV2SignalsEnabled } from '@/lib/projects/v2-config';
import type { NotionTask } from '@/types/notion';

function task(id: string, date: string): NotionTask {
  return {
    id,
    title: id,
    status: 'Pendiente',
    date,
    dateKind: 'future',
    priority: null,
    duration: null,
    energy: null,
    project: null,
    area: null,
    projectArea: null,
    blocker: null,
    note: null,
    domain: 'tasks',
  };
}

test('F-INTEGRATION-1. Each staged presentation and date flag fails closed independently', () => {
  const env = { PROJECTS_E6_SIGNALS_ENABLED: 'true', DAILY_PLANNING_V2_UI_ENABLED: 'TRUE' };

  assert.equal(isDailyPlanningV2UiEnabled(env), false);
  assert.equal(isTodayCockpitV2UiEnabled(env), false);
  assert.equal(isTaskDateSemanticsV2Enabled(env), false);
  assert.equal(isLearningHubV2Enabled(env), false);
  assert.equal(isProjectsV2SignalsEnabled(env), true);
});

test('F-INTEGRATION-2. An old legacy task date does not gain deadline pressure', () => {
  const state = deriveTaskDateState('2026-03-01', '2026-03-02');

  assert.equal(deriveTaskDateAttention('Pendiente', deriveTaskDateSemantics('2026-03-01', null), state), 'ambiguous');
  assert.equal(deriveTaskDateAttention('Pendiente', deriveTaskDateSemantics('2026-03-01', 'Deadline'), state), 'overdue');
  assert.equal(deriveTaskDateAttention('Pendiente', deriveTaskDateSemantics('2026-03-01', 'Objetivo'), state), 'review-needed');
});

test('F-INTEGRATION-3. Weekly task selection rejects impossible dates and invalid reference days', () => {
  const values = [task('impossible-day', '2026-02-30'), task('real-day', '2026-03-02')];

  assert.deepEqual(selectWeekTasks(values, [], '2026-03-02').map((item) => item.id), ['real-day']);
  assert.deepEqual(selectWeekTasks(values, [], '2026-02-30'), []);
  assert.equal(parsePlanningCivilDay('2026-02-30'), null);
  assert.equal(parsePlanningCivilDay('2025-02-29'), null);
  assert.ok(parsePlanningCivilDay('2024-02-29') !== null);
  assert.equal(parsePlanningCivilDay('2026-3-02'), null);
});
