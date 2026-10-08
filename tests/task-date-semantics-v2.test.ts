import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyTaskDateV2 } from '@/lib/tasks/date-semantics-v2';

const TODAY = '2026-10-08';

test('legacy dated task stays ambiguous and never becomes a Deadline by guess', () => {
  assert.deepEqual(classifyTaskDateV2('Pendiente', '2026-10-07', TODAY, null), {
    semantics: 'unspecified',
    dateState: 'past',
    attention: 'ambiguous',
  });
});

test('past unresolved Deadline is overdue', () => {
  assert.equal(
    classifyTaskDateV2('Pendiente', '2026-10-07', TODAY, 'Deadline').attention,
    'overdue',
  );
});

test('past Objetivo becomes review-needed, not overdue', () => {
  const result = classifyTaskDateV2('En progreso', '2026-10-07', TODAY, 'Objetivo');
  assert.equal(result.semantics, 'target');
  assert.equal(result.attention, 'review-needed');
});

test('Revisión becomes review-needed when reached', () => {
  assert.equal(
    classifyTaskDateV2('Pendiente', TODAY, TODAY, 'Revisión').attention,
    'review-needed',
  );
});

test('completed task does not create date pressure', () => {
  assert.equal(classifyTaskDateV2('Hecha', '2026-10-01', TODAY, 'Deadline').attention, 'normal');
});

test('task without date has no date semantics even if a stray type exists', () => {
  assert.deepEqual(classifyTaskDateV2('Pendiente', null, TODAY, 'Deadline'), {
    semantics: 'none',
    dateState: 'none',
    attention: 'normal',
  });
});
