import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPersonalPurchaseTransition,
  canTransitionPersonalPurchase,
  transitionPersonalPurchaseItem,
  validatePersonalPurchaseItem,
} from '@/lib/personal-shopping/core';
import {
  assertLegacyPersonalShoppingSourceShape,
  buildLegacyPersonalShoppingMigrationPlan,
} from '@/lib/personal-shopping/migration-core';
import { MemoryPersonalShoppingRepository } from '@/lib/personal-shopping/memory-store';
import type { PersonalPurchaseItem } from '@/lib/personal-shopping/types';

function item(overrides: Partial<PersonalPurchaseItem> = {}): PersonalPurchaseItem {
  return {
    id: 'item-1',
    title: 'Escritorio',
    state: 'RESEARCH',
    need: null,
    quantityText: null,
    category: null,
    currency: null,
    estimatedPriceMinor: null,
    targetPriceMinor: null,
    purchaseCondition: null,
    notes: null,
    candidateLinks: [],
    focus: false,
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:00:00.000Z',
    purchasedAt: null,
    discardedAt: null,
    sourceRef: null,
    financeMovementId: null,
    financeLinkState: 'none',
    recordStatus: 'active',
    ...overrides,
  };
}

test('personal shopping states preserve research as a distinct decision stage', () => {
  assert.equal(canTransitionPersonalPurchase('RESEARCH', 'BUY'), true);
  assert.equal(canTransitionPersonalPurchase('RESEARCH', 'PURCHASED'), false);
  assert.equal(canTransitionPersonalPurchase('BUY', 'PURCHASED'), true);
  assert.equal(canTransitionPersonalPurchase('PURCHASED', 'RESEARCH'), true);
});

test('purchase transition records purchase time and restore clears it', () => {
  const purchased = transitionPersonalPurchaseItem(
    item({ state: 'BUY' }),
    'PURCHASED',
    '2026-10-07T11:00:00.000Z',
  );
  assert.equal(purchased.purchasedAt, '2026-10-07T11:00:00.000Z');

  const restored = transitionPersonalPurchaseItem(
    purchased,
    'RESEARCH',
    '2026-10-07T12:00:00.000Z',
  );
  assert.equal(restored.purchasedAt, null);
  assert.equal(restored.discardedAt, null);
});

test('transition event remains explicit and idempotency-ready', () => {
  const mutation = buildPersonalPurchaseTransition({
    item: item({ state: 'BUY' }),
    toState: 'DISCARDED',
    occurredAt: '2026-10-07T11:00:00.000Z',
    eventId: 'event-1',
    operationId: 'operation-1',
  });
  assert.equal(mutation.event.eventType, 'DISCARDED');
  assert.equal(mutation.event.fromState, 'BUY');
  assert.equal(mutation.event.toState, 'DISCARDED');
  assert.equal(mutation.item.discardedAt, '2026-10-07T11:00:00.000Z');
});

test('money fields require integer minor units', () => {
  assert.doesNotThrow(() => validatePersonalPurchaseItem(item({ estimatedPriceMinor: 12345 })));
  assert.throws(
    () => validatePersonalPurchaseItem(item({ estimatedPriceMinor: 12.5 })),
    RangeError,
  );
});

test('legacy Notion migration dry-run preserves expected 12 / 0 / 19 shape', () => {
  const plan = buildLegacyPersonalShoppingMigrationPlan({
    existingItems: [],
    migratedAt: '2026-10-07T12:00:00.000Z',
  });
  assertLegacyPersonalShoppingSourceShape(plan);
  assert.deepEqual(plan.sourceCounts, { BUY: 12, RESEARCH: 19, REPLENISH: 0 });
  assert.equal(plan.toCreate.length, 31);
  assert.equal(plan.skippedSourceRefs.length, 0);
  assert.equal(
    plan.toCreate.find((entry) => entry.item.title.startsWith('Solución para neutralizar'))?.item
      .notes?.includes('Spray neutralizador'),
    true,
  );
});

test('legacy migration preserves exact source wording and is replay-safe', async () => {
  const first = buildLegacyPersonalShoppingMigrationPlan({
    existingItems: [],
    migratedAt: '2026-10-07T12:00:00.000Z',
  });
  assert.equal(first.toCreate[0]?.item.title, 'Prensa para ajo y limón.');

  const repository = new MemoryPersonalShoppingRepository();
  await repository.saveItemsWithEvents(first.toCreate);

  const existingItems = await repository.listItems();
  const replay = buildLegacyPersonalShoppingMigrationPlan({
    existingItems,
    migratedAt: '2026-10-07T13:00:00.000Z',
  });
  assert.equal(replay.toCreate.length, 0);
  assert.equal(replay.skippedSourceRefs.length, 31);

  await repository.saveItemsWithEvents(first.toCreate);
  assert.equal((await repository.listItems()).length, 31);
  assert.equal((await repository.listEvents()).length, 31);
});
