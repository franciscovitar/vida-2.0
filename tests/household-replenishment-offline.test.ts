import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyOptimisticHouseholdMutation,
  HouseholdMutationSyncEngine,
  MemoryHouseholdMutationOutboxStore,
  type HouseholdMutation,
  type HouseholdMutationSyncAck,
  type HouseholdMutationTransport,
} from '@/lib/household-replenishment/offline-sync';
import type { ReplenishmentSnapshot } from '@/lib/household-replenishment/types';

function bought(operationId = 'operation-buy-1'): HouseholdMutation {
  return {
    action: 'bought',
    needId: 'need-1',
    variantName: null,
    operationId,
  };
}

class RecordingTransport implements HouseholdMutationTransport {
  readonly calls: string[] = [];

  constructor(
    private readonly responder: (mutation: HouseholdMutation) => Promise<HouseholdMutationSyncAck>,
  ) {}

  async sendMutation(mutation: HouseholdMutation): Promise<HouseholdMutationSyncAck> {
    this.calls.push(mutation.operationId);
    return this.responder(mutation);
  }
}

const snapshot: ReplenishmentSnapshot = {
  householdName: 'Casa',
  buy: [
    {
      needId: 'need-1',
      name: 'Detergente',
      category: 'Otros',
      origin: 'MANUAL',
      confidence: 'LOW',
      reason: 'Agregado manualmente',
      expectedIntervalDays: 30,
      nextExpectedAt: null,
      lastPurchasedAt: null,
      lastPurchasedVariantId: null,
      lastPurchasedVariantName: null,
      variants: [],
    },
  ],
  watch: [
    {
      needId: 'need-2',
      name: 'Papel',
      category: 'Otros',
      origin: 'AUTO',
      confidence: 'MEDIUM',
      reason: 'Podría tocar pronto',
      expectedIntervalDays: 30,
      nextExpectedAt: null,
      lastPurchasedAt: null,
      lastPurchasedVariantId: null,
      lastPurchasedVariantName: null,
      variants: [],
    },
  ],
};

test('household outbox dedupes identical operation and rejects conflicting payload', async () => {
  const store = new MemoryHouseholdMutationOutboxStore();
  await store.persistMutation(bought(), '2026-09-29T01:00:00.000Z');
  await store.persistMutation(bought(), '2026-09-29T01:00:01.000Z');

  assert.equal((await store.listPendingMutations()).length, 1);

  await assert.rejects(
    () =>
      store.persistMutation(
        {
          action: 'correct',
          needId: 'need-1',
          type: 'LOW',
          operationId: 'operation-buy-1',
        },
        '2026-09-29T01:00:02.000Z',
      ),
    /operation conflict/,
  );
});

test('transport failure leaves household mutation pending for reconnect', async () => {
  const store = new MemoryHouseholdMutationOutboxStore();
  await store.persistMutation(bought(), '2026-09-29T01:00:00.000Z');

  const transport = new RecordingTransport(async () => {
    throw new Error('offline');
  });
  const engine = new HouseholdMutationSyncEngine(store, transport);

  const result = await engine.flush();

  assert.deepEqual(transport.calls, ['operation-buy-1']);
  assert.equal(result.stoppedOn, 'transport-error');
  assert.equal(result.acknowledged, 0);
  assert.equal(result.remaining, 1);
  assert.equal((await store.listPendingMutations()).length, 1);
});

test('accepted or duplicate server ack clears outbox exactly once', async () => {
  const store = new MemoryHouseholdMutationOutboxStore();
  await store.persistMutation(bought('operation-1'), '2026-09-29T01:00:00.000Z');
  await store.persistMutation(bought('operation-2'), '2026-09-29T01:00:01.000Z');

  const transport = new RecordingTransport(async (mutation) => ({
    operationId: mutation.operationId,
    status: mutation.operationId === 'operation-1' ? 'accepted' : 'duplicate',
    snapshot,
  }));
  const engine = new HouseholdMutationSyncEngine(store, transport);

  const result = await engine.flush();

  assert.deepEqual(transport.calls, ['operation-1', 'operation-2']);
  assert.equal(result.stoppedOn, 'none');
  assert.equal(result.acknowledged, 2);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.snapshot, snapshot);
  assert.deepEqual(await store.listPendingMutations(), []);
});

test('conflict stops flush and keeps pending operation for explicit recovery', async () => {
  const store = new MemoryHouseholdMutationOutboxStore();
  await store.persistMutation(bought(), '2026-09-29T01:00:00.000Z');

  const transport = new RecordingTransport(async (mutation) => ({
    operationId: mutation.operationId,
    status: 'conflict',
  }));
  const engine = new HouseholdMutationSyncEngine(store, transport);

  const result = await engine.flush();

  assert.equal(result.stoppedOn, 'conflict');
  assert.equal(result.remaining, 1);
  assert.equal((await store.listPendingMutations()).length, 1);
});

test('optimistic bought and STILL_HAVE remove item while LOW promotes watch to buy', () => {
  const afterBought = applyOptimisticHouseholdMutation(snapshot, bought());
  assert.equal(
    afterBought.buy.some((entry) => entry.needId === 'need-1'),
    false,
  );

  const afterStillHave = applyOptimisticHouseholdMutation(snapshot, {
    action: 'correct',
    needId: 'need-1',
    type: 'STILL_HAVE',
    operationId: 'operation-still-have',
  });
  assert.equal(
    afterStillHave.buy.some((entry) => entry.needId === 'need-1'),
    false,
  );

  const afterLow = applyOptimisticHouseholdMutation(snapshot, {
    action: 'correct',
    needId: 'need-2',
    type: 'LOW',
    operationId: 'operation-low',
  });
  assert.equal(
    afterLow.watch.some((entry) => entry.needId === 'need-2'),
    false,
  );
  assert.equal(
    afterLow.buy.some((entry) => entry.needId === 'need-2'),
    true,
  );
  assert.equal(afterLow.buy.find((entry) => entry.needId === 'need-2')?.origin, 'CORRECTION');
});
