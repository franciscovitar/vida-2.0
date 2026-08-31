import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTelegramDirectContextStore } from '../openclaw-plugin/vida-2-0-api/src/telegram-direct-context';

test('TDC1. trusted run metadata yields a one-time token without storing message content', () => {
  let now = 1_000;
  const store = createTelegramDirectContextStore({
    now: () => now,
    token: () => 'a'.repeat(48),
    ttlMs: 5_000,
  });

  assert.equal(
    store.record({ runId: 'run-1', senderId: '12345', messageId: '987' }),
    true,
  );
  const token = store.issue('run-1');
  assert.equal(token, 'a'.repeat(48));
  assert.deepEqual(store.consume(token!), {
    runId: 'run-1',
    senderId: '12345',
    messageId: '987',
  });
  assert.equal(store.consume(token!), null);

  now += 100;
  assert.equal(store.issue('run-1'), 'a'.repeat(48));
});

test('TDC2. fabricated, expired or malformed context fails closed', () => {
  let now = 10_000;
  let tokenIndex = 0;
  const store = createTelegramDirectContextStore({
    now: () => now,
    token: () => `${String(++tokenIndex).padStart(32, 'x')}`,
    ttlMs: 100,
  });

  assert.equal(store.issue('missing-run'), null);
  assert.equal(store.record({ runId: 'bad run', senderId: '123', messageId: '1' }), false);
  assert.equal(store.record({ runId: 'run-2', senderId: '123', messageId: '1' }), true);
  const issued = store.issue('run-2');
  assert.ok(issued);
  assert.equal(store.consume('model-invented-token'), null);

  now += 101;
  assert.equal(store.consume(issued!), null);
  assert.equal(store.issue('run-2'), null);
});

test('TDC3. clearRun revokes both pending run context and issued tokens', () => {
  const store = createTelegramDirectContextStore({
    now: () => 42,
    token: () => 'z'.repeat(48),
  });
  assert.equal(store.record({ runId: 'run-3', senderId: '555', messageId: '777' }), true);
  const issued = store.issue('run-3');
  assert.ok(issued);

  store.clearRun('run-3');
  assert.equal(store.issue('run-3'), null);
  assert.equal(store.consume(issued!), null);
});
