import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluatePredictionQuality } from '@/lib/household-replenishment/quality';
import { MemoryReplenishmentRepository } from '@/lib/household-replenishment/memory-store';
import { ReplenishmentService } from '@/lib/household-replenishment/service';
import type { PurchaseEvent, ReplenishmentNeed } from '@/lib/household-replenishment/types';

function purchase(needId: string, purchasedAt: string, index: number): PurchaseEvent {
  return {
    id: `${needId}-purchase-${index}`,
    householdId: 'h1',
    needId,
    variantId: null,
    purchasedAt,
    source: 'MANUAL',
    createdBy: 'owner-id',
    operationId: `${needId}-operation-${index}`,
  };
}

test('prediction quality backtest reports low error for a regular 30-day need', () => {
  const need: ReplenishmentNeed = {
    id: 'regular',
    householdId: 'h1',
    name: 'Detergente',
    category: 'Limpieza',
    manualSeedIntervalDays: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const dates = [
    '2026-01-01T12:00:00.000Z',
    '2026-01-31T12:00:00.000Z',
    '2026-03-02T12:00:00.000Z',
    '2026-04-01T12:00:00.000Z',
    '2026-05-01T12:00:00.000Z',
    '2026-05-31T12:00:00.000Z',
  ];

  const quality = evaluatePredictionQuality({
    needs: [need],
    purchases: dates.map((date, index) => purchase(need.id, date, index)),
    corrections: [],
  });

  assert.equal(quality.evaluatedPredictions, 4);
  assert.equal(quality.medianAbsoluteErrorDays, 0);
  assert.equal(quality.withinToleranceRate, 1);
  assert.equal(quality.earlyCount, 0);
  assert.equal(quality.lateCount, 0);
});

test('prediction quality remains COLLECTING until there is enough real evidence', () => {
  const need: ReplenishmentNeed = {
    id: 'short',
    householdId: 'h1',
    name: 'Shampoo',
    category: 'Higiene',
    manualSeedIntervalDays: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const quality = evaluatePredictionQuality({
    needs: [need],
    purchases: [
      purchase(need.id, '2026-01-01T12:00:00.000Z', 0),
      purchase(need.id, '2026-02-01T12:00:00.000Z', 1),
    ],
    corrections: [],
  });

  assert.equal(quality.status, 'COLLECTING');
  assert.equal(quality.evaluatedPredictions, 0);
  assert.equal(quality.meanAbsoluteErrorDays, null);
});

test('shopping preferences persist category order and snapshots follow that route', async () => {
  const repository = new MemoryReplenishmentRepository({
    households: [
      {
        id: 'h1',
        name: 'Casa',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  let sequence = 0;
  const service = new ReplenishmentService(repository, {
    now: () => new Date('2026-09-29T12:00:00.000Z'),
    id: () => `id-${++sequence}`,
  });

  await service.addManualNeed({
    householdId: 'h1',
    name: 'Gaseosa',
    category: 'Bebidas',
    operationId: 'add-gaseosa',
    principalId: 'owner-id',
  });
  await service.addManualNeed({
    householdId: 'h1',
    name: 'Lavandina',
    category: 'Limpieza',
    operationId: 'add-lavandina',
    principalId: 'owner-id',
  });

  const updated = await service.updateShoppingPreferences({
    householdId: 'h1',
    defaultStore: 'Supermercado Centro',
    categoryOrder: ['Limpieza', 'Bebidas', 'Otros'],
    operationId: 'preferences-1',
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;

  assert.equal(updated.snapshot.shoppingPreferences.defaultStore, 'Supermercado Centro');
  assert.deepEqual(updated.snapshot.buy.map((entry) => entry.name), ['Lavandina', 'Gaseosa']);
});

test('recategorizing a need preserves its identity and purchase history', async () => {
  const repository = new MemoryReplenishmentRepository({
    households: [{ id: 'h1', name: 'Casa', createdAt: '2026-01-01T00:00:00.000Z' }],
  });
  let sequence = 0;
  const service = new ReplenishmentService(repository, {
    now: () => new Date('2026-09-29T12:00:00.000Z'),
    id: () => `id-${++sequence}`,
  });

  const added = await service.addManualNeed({
    householdId: 'h1',
    name: 'Detergente',
    category: 'Otros',
    operationId: 'add-detergent',
    principalId: 'owner-id',
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;

  const needId = added.snapshot.buy[0]?.needId;
  assert.ok(needId);

  await service.markBought({
    householdId: 'h1',
    needId,
    operationId: 'buy-detergent',
    principalId: 'owner-id',
  });
  const categorized = await service.updateNeedCategory({
    householdId: 'h1',
    needId,
    category: 'Limpieza',
    operationId: 'categorize-detergent',
  });
  assert.equal(categorized.ok, true);

  const need = await repository.getNeed('h1', needId);
  const purchases = await repository.listPurchaseEvents('h1', needId);
  assert.equal(need?.category, 'Limpieza');
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0]?.needId, needId);
});
