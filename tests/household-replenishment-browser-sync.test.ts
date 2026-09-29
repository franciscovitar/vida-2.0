import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  attachHouseholdReconnectSync,
  type BrowserOnlineSource,
} from '@/lib/household-replenishment/browser-offline';
import {
  MemoryHouseholdMutationOutboxStore,
  type HouseholdMutation,
  type HouseholdMutationSyncAck,
  type HouseholdMutationTransport,
} from '@/lib/household-replenishment/offline-sync';

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

class RecordingTransport implements HouseholdMutationTransport {
  readonly calls: string[] = [];

  async sendMutation(mutation: HouseholdMutation): Promise<HouseholdMutationSyncAck> {
    this.calls.push(mutation.operationId);
    return {
      operationId: mutation.operationId,
      status: 'accepted',
    };
  }
}

function mutation(): HouseholdMutation {
  return {
    action: 'bought',
    needId: 'need-1',
    variantName: null,
    operationId: 'operation-offline-1',
  };
}

test('household reconnect waits while offline and flushes on online event', async () => {
  const store = new MemoryHouseholdMutationOutboxStore();
  const transport = new RecordingTransport();
  const source = new FakeOnlineSource();
  let online = false;

  await store.persistMutation(mutation(), '2026-09-29T01:00:00.000Z');

  const controller = attachHouseholdReconnectSync(
    store,
    transport,
    undefined,
    source,
    () => online,
  );

  assert.equal(source.hasListener(), true);
  assert.deepEqual(transport.calls, []);

  online = true;
  source.fireOnline();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(transport.calls, ['operation-offline-1']);
  assert.deepEqual(await store.listPendingMutations(), []);

  controller.dispose();
  assert.equal(source.hasListener(), false);
});

test('explicit household flush attempts transport even when online signal is false', async () => {
  const store = new MemoryHouseholdMutationOutboxStore();
  const transport = new RecordingTransport();
  const source = new FakeOnlineSource();

  await store.persistMutation(mutation(), '2026-09-29T01:00:00.000Z');

  const controller = attachHouseholdReconnectSync(store, transport, undefined, source, () => false);

  const result = await controller.flushNow();

  assert.deepEqual(transport.calls, ['operation-offline-1']);
  assert.equal(result.acknowledged, 1);
  assert.equal(result.remaining, 0);

  controller.dispose();
});
