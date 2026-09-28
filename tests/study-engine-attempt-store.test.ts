import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createStudyAttemptEvent,
  latestAttemptForReviewUnit,
  latestAttemptForStudyItem,
  MemoryAttemptOutboxStore,
  type StudyAttemptEvent,
} from '@/lib/study-engine/attempt-store';

function fixture(overrides: Partial<StudyAttemptEvent> = {}): StudyAttemptEvent {
  return createStudyAttemptEvent({
    id: 'attempt-1',
    idempotencyKey: 'attempt-1',
    sessionId: 'session-1',
    studyItemId: 'item-1',
    itemVersion: 1,
    reviewUnitId: 'review-1',
    subjectId: 'study-engine-demo',
    conceptId: 'concept-1',
    facetId: null,
    operation: 'recall',
    channel: 'theoretical',
    shownAt: '2026-09-27T17:00:00.000Z',
    answeredAt: '2026-09-27T17:00:04.250Z',
    response: null,
    correctness: true,
    rating: 'good',
    learnerConfidence: null,
    helpLevel: 'independent',
    seenBefore: false,
    contextFreshness: 'fresh',
    schedulerStateBefore: null,
    schedulerStateAfter: null,
    deviceId: 'device-1',
    ...overrides,
  });
}

test('attempt builder records non-negative response time', () => {
  assert.equal(fixture().responseTimeMs, 4250);
  assert.equal(fixture({ answeredAt: '2026-09-27T16:59:59.000Z' }).responseTimeMs, 0);
});

test('local store atomically preserves attempt history and pending outbox entry', async () => {
  const store = new MemoryAttemptOutboxStore();
  const attempt = fixture();

  await store.persistAttempt(attempt);

  assert.deepEqual(await store.listAttempts(), [attempt]);
  assert.deepEqual(await store.listPendingAttempts(), [attempt]);
});

test('retrying the same attempt is idempotent', async () => {
  const store = new MemoryAttemptOutboxStore();
  const attempt = fixture();

  await store.persistAttempt(attempt);
  await store.persistAttempt(attempt);

  assert.equal((await store.listAttempts()).length, 1);
  assert.equal((await store.listPendingAttempts()).length, 1);
});

test('same idempotency key with different payload fails closed', async () => {
  const store = new MemoryAttemptOutboxStore();
  await store.persistAttempt(fixture());

  await assert.rejects(
    () =>
      store.persistAttempt(
        fixture({
          id: 'attempt-2',
          correctness: false,
          rating: 'again',
        }),
      ),
    /id\/idempotency conflict/,
  );
});

test('marking an attempt synced clears only the outbox, never history', async () => {
  const store = new MemoryAttemptOutboxStore();
  const attempt = fixture();

  await store.persistAttempt(attempt);
  await store.markAttemptSynced(attempt.idempotencyKey);

  assert.deepEqual(await store.listPendingAttempts(), []);
  assert.deepEqual(await store.listAttempts(), [attempt]);
});

test('latestAttemptForStudyItem preserves seen-before history across sessions', () => {
  const first = fixture({
    id: 'attempt-1',
    answeredAt: '2026-09-27T17:00:04.250Z',
    schedulerStateAfter: null,
  });
  const later = fixture({
    id: 'attempt-2',
    idempotencyKey: 'attempt-2',
    answeredAt: '2026-09-28T17:00:04.250Z',
    schedulerStateAfter: null,
  });

  assert.equal(latestAttemptForStudyItem([later, first], 'item-1')?.id, 'attempt-2');
  assert.equal(latestAttemptForStudyItem([later, first], 'other-item'), null);
});


test('latestAttemptForReviewUnit shares history across cue variants', () => {
  const first = fixture({
    id: 'attempt-1',
    studyItemId: 'cue-a',
    reviewUnitId: 'review-shared',
    answeredAt: '2026-09-27T17:00:04.250Z',
  });
  const later = fixture({
    id: 'attempt-2',
    idempotencyKey: 'attempt-2',
    studyItemId: 'cue-b',
    reviewUnitId: 'review-shared',
    answeredAt: '2026-09-28T17:00:04.250Z',
  });

  assert.equal(latestAttemptForReviewUnit([first, later], 'review-shared')?.id, 'attempt-2');
  assert.equal(latestAttemptForReviewUnit([first, later], 'other-review'), null);
});
