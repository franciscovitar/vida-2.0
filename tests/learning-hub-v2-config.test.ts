import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isLearningHubV2UiEnabled } from '@/lib/learning/v2-config';

test('Learning Hub V2 is fail-closed by default', () => {
  assert.equal(isLearningHubV2UiEnabled({}), false);
  assert.equal(isLearningHubV2UiEnabled({ LEARNING_HUB_V2_UI_ENABLED: 'false' }), false);
});

test('Learning Hub V2 requires exact true', () => {
  assert.equal(isLearningHubV2UiEnabled({ LEARNING_HUB_V2_UI_ENABLED: 'true' }), true);
  assert.equal(isLearningHubV2UiEnabled({ LEARNING_HUB_V2_UI_ENABLED: 'TRUE' }), false);
});
