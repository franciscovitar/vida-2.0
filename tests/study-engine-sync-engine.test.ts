import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createStudyAttemptEvent,
  MemoryAttemptOutboxStore,
  type StudyAttemptEvent,
} from '@/lib/study-engine/attempt-store';
import {
  StudyAttemptSyncEngine,
  type StudyAttemptSyncAck,
  type StudyAttemptTransport,
} from '@/lib/study-engine/sync-engine';

function attempt(id: string, answeredAt: string): StudyAttemptEvent {
  return createStudyAttemptEvent({
    id,
    idempotencyKey: id,
    sessionId: 'session-1',
    studyItemId: 'item-' + id,
    itemVersion: 1,
    reviewUnitId: 'review-' + id,
    subjectId: 'study-engine-demo',
    conceptId: 'concept-' + id,
    facetId: null,
    operation: 'recall',
    channel: 'theoretical',
    shownAt: answeredAt,
    answeredAt,
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
  });
}

class FakeExactlyOnceTransport implements StudyAttemptTransport {
  readonly accepted = new Map<string, StudyAttemptEvent>();
  readonly calls: string[] = [];
  failOnceFor: string | null = null;

  async sendAttempt(value: StudyAttemptEvent): Promise<StudyAttemptSyncAck> {
    this.calls.push(value.idempotencyKey);

    if (this.failOnceFor === value.idempotencyKey) {
      this.failOnceFor = null;
      throw new Error('temporary network failure');
    }

    const existing = this.accepted.get(value.idempotencyKey);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(value)) {
        return { idempotencyKey: value.idempotencyKey, status: 'conflict' };
      }
      return { idempotencyKey: value.idempotencyKey, status: 'duplicate' };
    }

    this.accepted.set(value.idempotencyKey, structuredClone(value));
    return { idempotencyKey: value.idempotencyKey, status: 'accepted' };
  }
}

async function seed(store: MemoryAttemptOutboxStore) {
  await store.persistAttempt(attempt('a', '2026-09-27T18:00:01.000Z'));
  await store.persistAttempt(attempt('b', '2026-09-27T18:00:02.000Z'));
  await store.persistAttempt(attempt('c', '2026-09-27T18:00:03.000Z'));
}

test('flush sends pending attempts in stable order and clears only outbox', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new FakeExactlyOnceTransport();
  await seed(store);

  const result = await new StudyAttemptSyncEngine(store, transport).flush();

  assert.deepEqual(transport.calls, ['a', 'b', 'c']);
  assert.deepEqual(result, {
    attempted: 3,
    acknowledged: 3,
    remaining: 0,
    stoppedOn: 'none',
  });
  assert.equal((await store.listPendingAttempts()).length, 0);
  assert.equal((await store.listAttempts()).length, 3);
});

test('calling flush twice does not create remote duplicates', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new FakeExactlyOnceTransport();
  await seed(store);
  const engine = new StudyAttemptSyncEngine(store, transport);

  await engine.flush();
  const second = await engine.flush();

  assert.equal(transport.accepted.size, 3);
  assert.equal(transport.calls.length, 3);
  assert.deepEqual(second, {
    attempted: 0,
    acknowledged: 0,
    remaining: 0,
    stoppedOn: 'none',
  });
});

test('duplicate server acknowledgement repairs crash-after-accept without duplicating', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new FakeExactlyOnceTransport();
  const value = attempt('a', '2026-09-27T18:00:01.000Z');
  await store.persistAttempt(value);
  transport.accepted.set(value.idempotencyKey, structuredClone(value));

  const result = await new StudyAttemptSyncEngine(store, transport).flush();

  assert.equal(transport.accepted.size, 1);
  assert.equal(result.acknowledged, 1);
  assert.equal(result.remaining, 0);
});

test('transient transport failure preserves failed and later attempts for retry', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new FakeExactlyOnceTransport();
  transport.failOnceFor = 'b';
  await seed(store);
  const engine = new StudyAttemptSyncEngine(store, transport);

  const first = await engine.flush();
  assert.deepEqual(first, {
    attempted: 2,
    acknowledged: 1,
    remaining: 2,
    stoppedOn: 'transport-error',
  });
  assert.deepEqual(
    (await store.listPendingAttempts()).map((value) => value.id),
    ['b', 'c'],
  );

  const retry = await engine.flush();
  assert.equal(retry.remaining, 0);
  assert.equal(transport.accepted.size, 3);
});

test('conflicting idempotency payload never clears the local pending event', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new FakeExactlyOnceTransport();
  const local = attempt('a', '2026-09-27T18:00:01.000Z');
  await store.persistAttempt(local);
  transport.accepted.set(
    local.idempotencyKey,
    { ...structuredClone(local), rating: 'again' },
  );

  const result = await new StudyAttemptSyncEngine(store, transport).flush();

  assert.equal(result.stoppedOn, 'conflict');
  assert.equal(result.remaining, 1);
  assert.equal((await store.listAttempts()).length, 1);
});

test('concurrent flush calls coalesce into one transport pass', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new FakeExactlyOnceTransport();
  await seed(store);
  const engine = new StudyAttemptSyncEngine(store, transport);

  const [left, right] = await Promise.all([engine.flush(), engine.flush()]);

  assert.deepEqual(left, right);
  assert.equal(transport.calls.length, 3);
  assert.equal(transport.accepted.size, 3);
});
