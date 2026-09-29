import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MemoryReplenishmentRepository } from '@/lib/household-replenishment/memory-store';
import { ReplenishmentService } from '@/lib/household-replenishment/service';
import type { PurchaseEvent, ReplenishmentNeed } from '@/lib/household-replenishment/types';

function createProjectionFixture(nowIso: string) {
  let current = new Date(nowIso);
  let sequence = 0;
  const repository = new MemoryReplenishmentRepository({
    households: [
      {
        id: 'h1',
        name: 'Casa',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  const service = new ReplenishmentService(repository, {
    now: () => current,
    id: () => `projection-id-${++sequence}`,
  });

  return {
    repository,
    service,
    setNow(value: string) {
      current = new Date(value);
    },
  };
}

async function seedNeedWithPurchases(input: {
  repository: MemoryReplenishmentRepository;
  needId: string;
  name: string;
  purchaseDates: string[];
  seedIntervalDays?: number | null;
}) {
  const need: ReplenishmentNeed = {
    id: input.needId,
    householdId: 'h1',
    name: input.name,
    category: 'Hogar',
    manualSeedIntervalDays: input.seedIntervalDays ?? null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  await input.repository.putNeed(need);

  for (const [index, purchasedAt] of input.purchaseDates.entries()) {
    const purchase: PurchaseEvent = {
      id: `${input.needId}-purchase-${index}`,
      householdId: 'h1',
      needId: input.needId,
      variantId: null,
      purchasedAt,
      source: 'MANUAL',
      createdBy: 'owner-id',
      operationId: `${input.needId}-operation-${index}`,
    };
    await input.repository.appendPurchaseEvent(purchase);
  }

  return need;
}

test('high-confidence due need appears in Comprar without persisting an AUTO row', async () => {
  const fixture = createProjectionFixture('2026-04-28T12:00:00.000Z');
  await seedNeedWithPurchases({
    repository: fixture.repository,
    needId: 'paper',
    name: 'Papel cocina',
    purchaseDates: [
      '2026-01-01T12:00:00.000Z',
      '2026-01-31T12:00:00.000Z',
      '2026-03-02T12:00:00.000Z',
      '2026-04-01T12:00:00.000Z',
    ],
  });

  const first = await fixture.service.snapshot('h1');
  const second = await fixture.service.snapshot('h1');

  assert.equal(first.buy.length, 1);
  assert.equal(first.buy[0]?.needId, 'paper');
  assert.equal(first.buy[0]?.origin, 'AUTO');
  assert.equal(first.buy[0]?.confidence, 'HIGH');
  assert.equal(first.watch.length, 0);
  assert.deepEqual(second, first);
  assert.deepEqual(await fixture.repository.listShoppingItems('h1'), []);
});

test('medium-confidence due need appears only in Quizás pronto', async () => {
  const fixture = createProjectionFixture('2026-03-19T12:00:00.000Z');
  await seedNeedWithPurchases({
    repository: fixture.repository,
    needId: 'soap',
    name: 'Jabón',
    purchaseDates: [
      '2026-01-01T12:00:00.000Z',
      '2026-01-21T12:00:00.000Z',
      '2026-02-20T12:00:00.000Z',
    ],
  });

  const snapshot = await fixture.service.snapshot('h1');

  assert.equal(snapshot.buy.length, 0);
  assert.equal(snapshot.watch.length, 1);
  assert.equal(snapshot.watch[0]?.needId, 'soap');
  assert.equal(snapshot.watch[0]?.origin, 'AUTO');
  assert.equal(snapshot.watch[0]?.confidence, 'MEDIUM');
});

test('manual active item overrides an automatic suggestion without duplication', async () => {
  const fixture = createProjectionFixture('2026-04-28T12:00:00.000Z');
  await seedNeedWithPurchases({
    repository: fixture.repository,
    needId: 'bags',
    name: 'Bolsas de basura',
    purchaseDates: [
      '2026-01-01T12:00:00.000Z',
      '2026-01-31T12:00:00.000Z',
      '2026-03-02T12:00:00.000Z',
      '2026-04-01T12:00:00.000Z',
    ],
  });

  const result = await fixture.service.addManualNeed({
    householdId: 'h1',
    name: 'Bolsas de basura',
    operationId: 'manual-bags-operation',
    principalId: 'owner-id',
  });
  assert.equal(result.ok, true);

  const snapshot = await fixture.service.snapshot('h1');
  const items = await fixture.repository.listShoppingItems('h1');

  assert.equal(snapshot.buy.length, 1);
  assert.equal(snapshot.buy[0]?.needId, 'bags');
  assert.equal(snapshot.buy[0]?.origin, 'MANUAL');
  assert.equal(snapshot.watch.length, 0);
  assert.equal(items.filter((item) => item.state === 'ACTIVE').length, 1);
});

test('STILL_HAVE removes an automatic suggestion and LOW promotes WATCH to Comprar', async () => {
  const highFixture = createProjectionFixture('2026-04-28T12:00:00.000Z');
  await seedNeedWithPurchases({
    repository: highFixture.repository,
    needId: 'towels',
    name: 'Servilletas',
    purchaseDates: [
      '2026-01-01T12:00:00.000Z',
      '2026-01-31T12:00:00.000Z',
      '2026-03-02T12:00:00.000Z',
      '2026-04-01T12:00:00.000Z',
    ],
  });

  const beforeStillHave = await highFixture.service.snapshot('h1');
  assert.equal(beforeStillHave.buy[0]?.origin, 'AUTO');

  await highFixture.service.correctNeed({
    householdId: 'h1',
    needId: 'towels',
    type: 'STILL_HAVE',
    operationId: 'still-have-towels',
    principalId: 'owner-id',
  });
  const afterStillHave = await highFixture.service.snapshot('h1');
  assert.equal(afterStillHave.buy.length, 0);
  assert.equal(afterStillHave.watch.length, 0);

  const watchFixture = createProjectionFixture('2026-03-19T12:00:00.000Z');
  await seedNeedWithPurchases({
    repository: watchFixture.repository,
    needId: 'cleaner',
    name: 'Limpiador',
    purchaseDates: [
      '2026-01-01T12:00:00.000Z',
      '2026-01-21T12:00:00.000Z',
      '2026-02-20T12:00:00.000Z',
    ],
  });
  const beforeLow = await watchFixture.service.snapshot('h1');
  assert.equal(beforeLow.watch.length, 1);

  await watchFixture.service.correctNeed({
    householdId: 'h1',
    needId: 'cleaner',
    type: 'LOW',
    operationId: 'low-cleaner',
    principalId: 'owner-id',
  });
  const afterLow = await watchFixture.service.snapshot('h1');

  assert.equal(afterLow.watch.length, 0);
  assert.equal(afterLow.buy.length, 1);
  assert.equal(afterLow.buy[0]?.origin, 'CORRECTION');
});

test('buying an automatic suggestion records one AUTO purchase and starts the next cycle', async () => {
  const fixture = createProjectionFixture('2026-04-28T12:00:00.000Z');
  await seedNeedWithPurchases({
    repository: fixture.repository,
    needId: 'paper',
    name: 'Papel cocina',
    purchaseDates: [
      '2026-01-01T12:00:00.000Z',
      '2026-01-31T12:00:00.000Z',
      '2026-03-02T12:00:00.000Z',
      '2026-04-01T12:00:00.000Z',
    ],
  });

  const first = await fixture.service.markBought({
    householdId: 'h1',
    needId: 'paper',
    operationId: 'auto-buy-paper',
    principalId: 'owner-id',
  });
  const replay = await fixture.service.markBought({
    householdId: 'h1',
    needId: 'paper',
    operationId: 'auto-buy-paper',
    principalId: 'owner-id',
  });

  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.code, 'idempotent');

  const purchases = await fixture.repository.listPurchaseEvents('h1', 'paper');
  assert.equal(purchases.length, 5);
  assert.equal(purchases.at(-1)?.source, 'AUTO');

  const snapshot = await fixture.service.snapshot('h1');
  assert.equal(snapshot.buy.length, 0);
  assert.equal(snapshot.watch.length, 0);
  assert.deepEqual(await fixture.repository.listShoppingItems('h1'), []);
});

test('snapshot exposes active need catalog and add-existing promotes one need idempotently', async () => {
  const fixture = createProjectionFixture('2026-02-01T12:00:00.000Z');
  await seedNeedWithPurchases({
    repository: fixture.repository,
    needId: 'yerba',
    name: 'Yerba',
    purchaseDates: [],
  });
  await seedNeedWithPurchases({
    repository: fixture.repository,
    needId: 'coffee',
    name: 'Café',
    purchaseDates: [],
  });

  const before = await fixture.service.snapshot('h1');
  assert.equal(before.buy.length, 0);
  assert.equal(before.watch.length, 0);
  assert.deepEqual(
    before.catalog.map((entry) => [entry.needId, entry.status]),
    [
      ['coffee', 'IDLE'],
      ['yerba', 'IDLE'],
    ],
  );

  const first = await fixture.service.addExistingNeedToList({
    householdId: 'h1',
    needId: 'yerba',
    operationId: 'catalog-add-yerba',
    principalId: 'owner-id',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.code, 'applied');
  assert.equal(first.snapshot.buy.filter((entry) => entry.needId === 'yerba').length, 1);
  assert.equal(first.snapshot.catalog.find((entry) => entry.needId === 'yerba')?.status, 'BUY');

  const second = await fixture.service.addExistingNeedToList({
    householdId: 'h1',
    needId: 'yerba',
    operationId: 'catalog-add-yerba-again',
    principalId: 'owner-id',
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.code, 'existing');

  const items = await fixture.repository.listShoppingItems('h1');
  assert.equal(
    items.filter((item) => item.needId === 'yerba' && item.state === 'ACTIVE').length,
    1,
  );
});
