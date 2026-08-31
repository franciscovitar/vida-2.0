import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTelegramDirectContextStore } from '../openclaw-plugin/vida-2-0-api/src/telegram-direct-context';

test('TDC1. trusted run metadata binds to one tool call without storing message content', () => {
  let now = 1_000;
  const store = createTelegramDirectContextStore({
    now: () => now,
    ttlMs: 5_000,
  });

  assert.equal(store.record({ runId: 'run-1', senderId: '12345', messageId: '987' }), true);
  assert.equal(store.bindToolCall('run-1', 'call-1'), true);
  assert.deepEqual(store.consumeToolCall('call-1'), {
    runId: 'run-1',
    senderId: '12345',
    messageId: '987',
  });
  assert.equal(store.consumeToolCall('call-1'), null);

  now += 100;
  assert.equal(store.bindToolCall('run-1', 'call-2'), true);
});

test('TDC2. fabricated, duplicate, expired or malformed bindings fail closed', () => {
  let now = 10_000;
  const store = createTelegramDirectContextStore({
    now: () => now,
    ttlMs: 100,
  });

  assert.equal(store.bindToolCall('missing-run', 'call-0'), false);
  assert.equal(store.record({ runId: 'bad run', senderId: '123', messageId: '1' }), false);
  assert.equal(store.record({ runId: 'run-2', senderId: '123', messageId: '1' }), true);
  assert.equal(store.bindToolCall('run-2', 'bad call'), false);
  assert.equal(store.bindToolCall('run-2', 'call-2'), true);
  assert.equal(store.bindToolCall('run-2', 'call-2'), false);
  assert.equal(store.consumeToolCall('model-invented-call'), null);

  now += 101;
  assert.equal(store.consumeToolCall('call-2'), null);
  assert.equal(store.bindToolCall('run-2', 'call-3'), false);
});

test('TDC3. clearRun revokes both pending run context and bound tool calls', () => {
  const store = createTelegramDirectContextStore({ now: () => 42 });
  assert.equal(store.record({ runId: 'run-3', senderId: '555', messageId: '777' }), true);
  assert.equal(store.bindToolCall('run-3', 'call-3'), true);

  store.clearRun('run-3');
  assert.equal(store.bindToolCall('run-3', 'call-4'), false);
  assert.equal(store.consumeToolCall('call-3'), null);
});
