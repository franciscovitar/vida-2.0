import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createStudyAttemptEvent,
  MemoryAttemptOutboxStore,
  type StudyAttemptEvent,
} from '@/lib/study-engine/attempt-store';
import {
  attachStudyReconnectSync,
  type BrowserOnlineSource,
} from '@/lib/study-engine/browser-sync';
import type { StudyAttemptSyncAck, StudyAttemptTransport } from '@/lib/study-engine/sync-engine';

class FakeOnlineSource implements BrowserOnlineSource {
  private listener: (() => void) | null = null;

  addEventListener(type: 'online', listener: () => void) {
    assert.equal(type, 'online');
    this.listener = listener;
  }

  removeEventListener(type: 'online', listener: () => void) {
    assert.equal(type, 'online');
    if (this.listener === listener) this.listener = null;
  }

  fireOnline() {
    this.listener?.();
  }

  hasListener() {
    return this.listener !== null;
  }
}

class RecordingTransport implements StudyAttemptTransport {
  readonly calls: string[] = [];

  async sendAttempt(attempt: StudyAttemptEvent): Promise<StudyAttemptSyncAck> {
    this.calls.push(attempt.idempotencyKey);
    return { idempotencyKey: attempt.idempotencyKey, status: 'accepted' };
  }
}

function fixture(): StudyAttemptEvent {
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
    shownAt: '2026-09-27T18:00:00.000Z',
    answeredAt: '2026-09-27T18:00:01.000Z',
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

test('reconnect controller does not flush while offline and flushes on online event', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new RecordingTransport();
  const source = new FakeOnlineSource();
  let online = false;
  await store.persistAttempt(fixture());

  const controller = attachStudyReconnectSync(store, transport, source, () => online);
  assert.equal(source.hasListener(), true);
  assert.deepEqual(transport.calls, []);

  online = true;
  source.fireOnline();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(transport.calls, ['attempt-1']);
  assert.deepEqual(await store.listPendingAttempts(), []);

  controller.dispose();
  assert.equal(source.hasListener(), false);
});

test('reconnect controller can explicitly flush when already online', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new RecordingTransport();
  const source = new FakeOnlineSource();
  await store.persistAttempt(fixture());

  const controller = attachStudyReconnectSync(store, transport, source, () => true);
  await controller.flushNow();

  assert.deepEqual(transport.calls, ['attempt-1']);
  assert.deepEqual(await store.listPendingAttempts(), []);

  controller.dispose();
});


test('explicit flush attempts transport even if navigator-style online signal is false', async () => {
  const store = new MemoryAttemptOutboxStore();
  const transport = new RecordingTransport();
  const source = new FakeOnlineSource();
  await store.persistAttempt(fixture());

  const controller = attachStudyReconnectSync(store, transport, source, () => false);
  assert.deepEqual(transport.calls, []);

  const result = await controller.flushNow();

  assert.deepEqual(transport.calls, ['attempt-1']);
  assert.equal(result.acknowledged, 1);
  assert.equal(result.remaining, 0);

  controller.dispose();
});
