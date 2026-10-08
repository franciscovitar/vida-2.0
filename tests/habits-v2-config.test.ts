import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isHabitsV2UiEnabled, isHabitsV2WritesEnabled } from '@/lib/habits/v2-config';

test('Habits V2 UI is fail-closed by default', () => {
  assert.equal(isHabitsV2UiEnabled({}), false);
  assert.equal(isHabitsV2UiEnabled({ HABITS_V2_UI_ENABLED: 'false' }), false);
  assert.equal(isHabitsV2UiEnabled({ HABITS_V2_UI_ENABLED: 'TRUE' }), false);
  assert.equal(isHabitsV2UiEnabled({ HABITS_V2_UI_ENABLED: 'true' }), true);
});

test('Habits V2 writes use an independent exact-true gate', () => {
  assert.equal(isHabitsV2WritesEnabled({}), false);
  assert.equal(isHabitsV2WritesEnabled({ HABITS_V2_WRITES_ENABLED: 'false' }), false);
  assert.equal(isHabitsV2WritesEnabled({ HABITS_V2_WRITES_ENABLED: 'TRUE' }), false);
  assert.equal(isHabitsV2WritesEnabled({ HABITS_V2_WRITES_ENABLED: 'true' }), true);
});
