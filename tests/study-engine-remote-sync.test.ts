import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import type { UpstashRedisFetch, UpstashRestConfig } from '@/lib/actions/upstash-rest';
import { handleStudyAttemptPost } from '@/lib/study-engine/attempt-api';
import {
  createStudyAttemptEvent,
  MemoryAttemptOutboxStore,
  type StudyAttemptEvent,
} from '@/lib/study-engine/attempt-store';
import {
  HttpStudyAttemptTransport,
  type StudyHttpFetch,
} from '@/lib/study-engine/http-attempt-transport';
import { createUpstashStudyAttemptStore } from '@/lib/study-engine/remote-attempt-store';
import { StudyAttemptSyncEngine } from '@/lib/study-engine/sync-engine';

const CONFIG: UpstashRestConfig = {
  url: 'https://study-test.upstash.io',
  token: 'test-token-with-safe-length',
  namespace: 'vida2:study-engine:test:v1',
  timeoutMs: 1000,
};

function fixture(id: string, answeredAt: string): StudyAttemptEvent {
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

function fakeUpstash() {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const fetchImpl: UpstashRedisFetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    let result: unknown;

    if (command[0] === 'EVAL') {
      const attemptKey = String(command[3]);
      const indexKey = String(command[4]);
      const payload = String(command[5]);
      const existing = values.get(attemptKey);

      if (existing !== undefined) result = existing === payload ? 2 : -1;
      else {
        values.set(attemptKey, payload);
        result = 1;
      }

      if (result === 1 || result === 2) {
        const index = sets.get(indexKey) ?? new Set<string>();
        index.add(attemptKey);
        sets.set(indexKey, index);
      }
    } else if (command[0] === 'SCARD') {
      result = sets.get(String(command[1]))?.size ?? 0;
    } else {
      return new Response(JSON.stringify({ error: 'unsupported-command' }), { status: 400 });
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { fetchImpl };
}

test('remote store is exactly-once and user-isolated', async () => {
  const redis = fakeUpstash();
  const store = createUpstashStudyAttemptStore(CONFIG, redis.fetchImpl);
  const original = fixture('attempt-1', '2026-09-27T20:00:00.000Z');

  assert.equal((await store.acceptAttempt('user-1', original)).status, 'accepted');
  assert.equal((await store.acceptAttempt('user-1', original)).status, 'duplicate');
  assert.equal(
    (await store.acceptAttempt('user-1', { ...original, rating: 'again' })).status,
    'conflict',
  );
  assert.equal(await store.countAttempts('user-1'), 1);
  assert.equal(await store.countAttempts('user-2'), 0);
});

test('offline outbox reaches remote store once through the HTTP boundary', async () => {
  const redis = fakeUpstash();
  const remote = createUpstashStudyAttemptStore(CONFIG, redis.fetchImpl);
  const local = new MemoryAttemptOutboxStore();
  const values = [
    fixture('a', '2026-09-27T20:00:01.000Z'),
    fixture('b', '2026-09-27T20:00:02.000Z'),
    fixture('c', '2026-09-27T20:00:03.000Z'),
  ];
  for (const value of values) await local.persistAttempt(value);

  const httpFetch: StudyHttpFetch = async (input, init) => {
    const relative = typeof input === 'string' ? input : String(input);
    return handleStudyAttemptPost(
      new Request(new URL(relative, 'https://vida.test'), init),
      'user-1',
      remote,
    );
  };

  const transport = new HttpStudyAttemptTransport(httpFetch);
  const result = await new StudyAttemptSyncEngine(local, transport).flush();

  assert.deepEqual(result, {
    attempted: 3,
    acknowledged: 3,
    remaining: 0,
    stoppedOn: 'none',
  });
  assert.equal(await remote.countAttempts('user-1'), 3);

  const retry = await transport.sendAttempt(values[0]!);
  assert.equal(retry.status, 'duplicate');
  assert.equal(await remote.countAttempts('user-1'), 3);
});

test('API rejects an idempotency mismatch before a durable write', async () => {
  const redis = fakeUpstash();
  const remote = createUpstashStudyAttemptStore(CONFIG, redis.fetchImpl);
  const value = fixture('a', '2026-09-27T20:00:01.000Z');

  const response = await handleStudyAttemptPost(
    new Request('https://vida.test/api/study-engine/v1/attempts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'different',
      },
      body: JSON.stringify({ attempt: value }),
    }),
    'user-1',
    remote,
  );

  assert.equal(response.status, 400);
  assert.equal(await remote.countAttempts('user-1'), 0);
});

test('route authenticates before creating the remote store', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/api/study-engine/v1/attempts/route.ts'),
    'utf8',
  );
  const authIndex = source.indexOf('await verifySession()');
  const storeIndex = source.indexOf('createStudyRemoteAttemptStoreFromEnv()');
  assert.ok(authIndex >= 0);
  assert.ok(storeIndex > authIndex);
  assert.match(source, /status:\s*401/);
});

test('HTTP transport exposes a bounded failure category without leaking response bodies', async () => {
  const transport = new HttpStudyAttemptTransport(async () => {
    return new Response(JSON.stringify({ error: 'private-provider-detail' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  await assert.rejects(
    () => transport.sendAttempt(fixture('x', '2026-09-27T20:10:00.000Z')),
    /study-attempt-sync-unavailable/,
  );
  assert.equal(transport.getLastFailure(), 'servidor');
});
