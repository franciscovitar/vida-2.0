import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  deriveTaskDateAttention,
  deriveTaskDateSemantics,
  deriveTaskDateState,
} from '@/lib/notion/task-date-semantics';

test('Task date V2: legacy dated task stays unspecified/ambiguous, never deadline', () => {
  const semantics = deriveTaskDateSemantics('2026-10-01', null);
  const state = deriveTaskDateState('2026-10-01', '2026-10-08');

  assert.equal(semantics, 'unspecified');
  assert.equal(state, 'past');
  assert.equal(deriveTaskDateAttention('Pendiente', semantics, state), 'ambiguous');
});

test('Task date V2: only past Deadline becomes overdue', () => {
  const deadline = deriveTaskDateSemantics('2026-10-01', 'Deadline');
  const target = deriveTaskDateSemantics('2026-10-01', 'Objetivo');
  const past = deriveTaskDateState('2026-10-01', '2026-10-08');

  assert.equal(deriveTaskDateAttention('Pendiente', deadline, past), 'overdue');
  assert.equal(deriveTaskDateAttention('Pendiente', target, past), 'review-needed');
});

test('Task date V2: Review becomes review-needed when reached, not overdue', () => {
  const review = deriveTaskDateSemantics('2026-10-08', 'Revisión');
  const today = deriveTaskDateState('2026-10-08', '2026-10-08');

  assert.equal(deriveTaskDateAttention('Pendiente', review, today), 'review-needed');
});

test('Task date V2: completed/someday tasks do not produce active date pressure', () => {
  const deadline = deriveTaskDateSemantics('2026-10-01', 'Deadline');
  const past = deriveTaskDateState('2026-10-01', '2026-10-08');

  assert.equal(deriveTaskDateAttention('Hecha', deadline, past), 'normal');
  assert.equal(deriveTaskDateAttention('Algún día', deadline, past), 'normal');
});
