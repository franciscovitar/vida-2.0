import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatExternalMediaScore } from '@/lib/media/score-format';

test('scores externos preservan precisión según Score versión', () => {
  assert.equal(formatExternalMediaScore(9.68, 'external-scoring-v1.2'), '9,68');
  assert.equal(formatExternalMediaScore(9.68, 'external-scoring-v1.1'), '9,7');
  assert.equal(formatExternalMediaScore(9.68, null), '9,7');
  assert.equal(formatExternalMediaScore(null, 'external-scoring-v1.2'), '—');
});
