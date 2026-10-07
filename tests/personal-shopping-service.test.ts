import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MemoryPersonalShoppingRepository } from '@/lib/personal-shopping/memory-store';
import { PersonalShoppingService } from '@/lib/personal-shopping/service';

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
