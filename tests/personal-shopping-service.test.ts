import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MemoryPersonalShoppingRepository } from '@/lib/personal-shopping/memory-store';
import { PersonalShoppingService } from '@/lib/personal-shopping/service';
import type { PersonalPurchaseItem } from '@/lib/personal-shopping/types';

function item(overrides: Partial<PersonalPurchaseItem> = {}): PersonalPurchaseItem {
  return {
    id: 'ps_item-1',
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
    sourceRef: 'legacy:test',
    financeMovementId: null,
    financeLinkState: 'none',
    recordStatus: 'active',
    ...overrides,
  };
}

test('personal shopping quick add creates a minimal BUY item without mandatory metadata', async () => {
  const repository = new MemoryPersonalShoppingRepository();
  let nextId = 0;
  const service = new PersonalShoppingService(repository, {
    now: () => new Date('2026-10-07T14:00:00.000Z'),
    id: () => `id-${++nextId}`,
  });

  const result = await service.add({
    title: '  Auriculares para entrenar  ',
    state: 'BUY',
    operationId: 'operation-add-001',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.code, 'applied');
  assert.equal(result.snapshot.items.length, 1);
  assert.deepEqual(
    {
      title: result.snapshot.items[0]?.title,
      state: result.snapshot.items[0]?.state,
      price: result.snapshot.items[0]?.estimatedPriceMinor,
      category: result.snapshot.items[0]?.category,
    },
    {
      title: 'Auriculares para entrenar',
      state: 'BUY',
      price: null,
      category: null,
    },
  );
});

test('personal shopping quick add keeps research separate from buying', async () => {
  const repository = new MemoryPersonalShoppingRepository();
  const service = new PersonalShoppingService(repository, {
    now: () => new Date('2026-10-07T14:00:00.000Z'),
    id: () => 'fixed-id',
  });

  const result = await service.add({
    title: 'Robot aspirador',
    state: 'RESEARCH',
    operationId: 'operation-research-001',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.counts.RESEARCH, 1);
  assert.equal(result.snapshot.counts.BUY, 0);
});

test('personal shopping quick add is idempotent by operation id', async () => {
  const repository = new MemoryPersonalShoppingRepository();
  let nextId = 0;
  const service = new PersonalShoppingService(repository, {
    now: () => new Date('2026-10-07T14:00:00.000Z'),
    id: () => `id-${++nextId}`,
  });

  const input = {
    title: 'Pilas',
    state: 'BUY',
    operationId: 'operation-repeat-001',
  } as const;
  const first = await service.add(input);
  const second = await service.add(input);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.code, 'idempotent');
  assert.equal((await repository.listItems()).length, 1);
  assert.equal((await repository.listEvents()).length, 1);
});

test('personal shopping avoids accidental duplicate active titles', async () => {
  const repository = new MemoryPersonalShoppingRepository();
  let nextId = 0;
  const service = new PersonalShoppingService(repository, {
    now: () => new Date('2026-10-07T14:00:00.000Z'),
    id: () => `id-${++nextId}`,
  });

  await service.add({
    title: 'Báscula inteligente',
    state: 'RESEARCH',
    operationId: 'operation-first-001',
  });
  const duplicate = await service.add({
    title: '  bascula   inteligente ',
    state: 'BUY',
    operationId: 'operation-second-001',
  });

  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.equal(duplicate.code, 'existing');
  assert.equal((await repository.listItems()).length, 1);
});

test('personal shopping rejects history states as quick-capture destinations', async () => {
  const service = new PersonalShoppingService(new MemoryPersonalShoppingRepository());
  const result = await service.add({
    title: 'Compra inválida',
    state: 'PURCHASED',
    operationId: 'operation-invalid-001',
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'invalid-input',
    message: 'Ingresá una compra válida y elegí Comprar, Investigar o Reponer.',
  });
});

test('personal shopping detail update persists optional decision fields and one audit event', async () => {
  const repository = new MemoryPersonalShoppingRepository({
    items: [item({ financeMovementId: 'finance-existing', financeLinkState: 'linked' })],
  });
  let nextId = 0;
  const service = new PersonalShoppingService(repository, {
    now: () => new Date('2026-10-07T15:00:00.000Z'),
    id: () => `id-${++nextId}`,
  });

  const result = await service.updateDetails({
    itemId: 'ps_item-1',
    operationId: 'operation-detail-001',
    patch: {
      need: 'Trabajar más cómodo',
      quantityText: '1',
      category: 'Oficina',
      currency: 'ars',
      estimatedPriceMinor: 15000000,
      targetPriceMinor: 12500000,
      purchaseCondition: 'Si entra en el escritorio',
      notes: 'Comparar materiales',
      candidateLinks: ['https://example.com/escritorio'],
      focus: true,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const updated = result.snapshot.items[0];
  assert.equal(updated?.currency, 'ARS');
  assert.equal(updated?.purchaseCondition, 'Si entra en el escritorio');
  assert.equal(updated?.financeMovementId, 'finance-existing');
  assert.equal(updated?.financeLinkState, 'linked');
  const events = await repository.listEvents('ps_item-1');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, 'DETAIL_UPDATED');
  assert.equal(events[0]?.operationId, 'operation-detail-001');
});

test('personal shopping lifecycle moves closed items to history and restore is explicit', async () => {
  const repository = new MemoryPersonalShoppingRepository({ items: [item({ state: 'BUY' })] });
  let now = '2026-10-07T15:00:00.000Z';
  let nextId = 0;
  const service = new PersonalShoppingService(repository, {
    now: () => new Date(now),
    id: () => `id-${++nextId}`,
  });

  const purchased = await service.transition({
    itemId: 'ps_item-1',
    toState: 'PURCHASED',
    operationId: 'operation-purchase-001',
  });
  assert.equal(purchased.ok, true);
  if (!purchased.ok) return;
  assert.equal(purchased.snapshot.counts.BUY, 0);
  assert.equal(purchased.snapshot.counts.PURCHASED, 1);
  assert.equal(purchased.snapshot.items[0]?.purchasedAt, '2026-10-07T15:00:00.000Z');

  now = '2026-10-07T16:00:00.000Z';
  const restored = await service.transition({
    itemId: 'ps_item-1',
    toState: 'RESEARCH',
    operationId: 'operation-restore-001',
  });
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.snapshot.counts.PURCHASED, 0);
  assert.equal(restored.snapshot.counts.RESEARCH, 1);
  assert.equal(restored.snapshot.items[0]?.purchasedAt, null);

  const events = await repository.listEvents('ps_item-1');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['PURCHASED', 'RESTORED'],
  );
});

test('personal shopping transition is replay-safe and never mutates Finance linkage', async () => {
  const repository = new MemoryPersonalShoppingRepository({
    items: [item({ state: 'BUY', financeMovementId: 'finance-existing', financeLinkState: 'linked' })],
  });
  let nextId = 0;
  const service = new PersonalShoppingService(repository, {
    now: () => new Date('2026-10-07T15:00:00.000Z'),
    id: () => `id-${++nextId}`,
  });

  const first = await service.transition({
    itemId: 'ps_item-1',
    toState: 'PURCHASED',
    operationId: 'operation-purchase-repeat',
  });
  const replay = await service.transition({
    itemId: 'ps_item-1',
    toState: 'PURCHASED',
    operationId: 'operation-purchase-repeat',
  });

  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  if (!replay.ok) return;
  assert.equal(replay.code, 'idempotent');
  assert.equal((await repository.listEvents()).length, 1);
  assert.equal(replay.snapshot.items[0]?.financeMovementId, 'finance-existing');
  assert.equal(replay.snapshot.items[0]?.financeLinkState, 'linked');
});
