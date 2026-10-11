import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isDailyPlanningV2UiEnabled,
  isPlanningExecutionV2ReadsEnabled,
  isTaskDateSemanticsV2Enabled,
  isTodayCockpitV2UiEnabled,
} from '@/lib/daily-planning/v2-config';

test('Daily Planning V2 UI is fail-closed by default', () => {
  assert.equal(isDailyPlanningV2UiEnabled({}), false);
  assert.equal(isDailyPlanningV2UiEnabled({ DAILY_PLANNING_V2_UI_ENABLED: 'false' }), false);
});

test('Daily Planning V2 UI requires exact true', () => {
  assert.equal(isDailyPlanningV2UiEnabled({ DAILY_PLANNING_V2_UI_ENABLED: 'true' }), true);
  assert.equal(isDailyPlanningV2UiEnabled({ DAILY_PLANNING_V2_UI_ENABLED: 'TRUE' }), false);
});

test('Today cockpit V2 is independently fail-closed', () => {
  assert.equal(isTodayCockpitV2UiEnabled({}), false);
  assert.equal(isTodayCockpitV2UiEnabled({ TODAY_COCKPIT_V2_UI_ENABLED: 'false' }), false);
  assert.equal(isTodayCockpitV2UiEnabled({ TODAY_COCKPIT_V2_UI_ENABLED: 'true' }), true);
  assert.equal(isTodayCockpitV2UiEnabled({ TODAY_COCKPIT_V2_UI_ENABLED: 'TRUE' }), false);
});

test('Task date semantics V2 is independently fail-closed', () => {
  assert.equal(isTaskDateSemanticsV2Enabled({}), false);
  assert.equal(isTaskDateSemanticsV2Enabled({ TASK_DATE_SEMANTICS_V2_ENABLED: 'false' }), false);
  assert.equal(isTaskDateSemanticsV2Enabled({ TASK_DATE_SEMANTICS_V2_ENABLED: 'true' }), true);
  assert.equal(isTaskDateSemanticsV2Enabled({ TASK_DATE_SEMANTICS_V2_ENABLED: 'TRUE' }), false);
});

test('Execution history read gate is separate from the V2 UI and OFF by default', () => {
  assert.equal(isPlanningExecutionV2ReadsEnabled({}), false);
  assert.equal(isPlanningExecutionV2ReadsEnabled({ DAILY_PLANNING_V2_UI_ENABLED: 'true' }), false);
  assert.equal(isPlanningExecutionV2ReadsEnabled({ PLANNING_EXECUTION_V2_READS_ENABLED: 'TRUE' }), false);
  assert.equal(isPlanningExecutionV2ReadsEnabled({ PLANNING_EXECUTION_V2_READS_ENABLED: 'true' }), true);
});
