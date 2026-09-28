import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateGoogleSignIn,
  resolveAuthProxyDecision,
  resolveHouseholdMemberEmails,
  resolveIdentityAllowedEmails,
} from '@/lib/auth/authorize';
import { estimateCadence } from '@/lib/household-replenishment/engine';
import { evaluateHouseholdAccess } from '@/lib/household-replenishment/access-core';
import { MemoryReplenishmentRepository } from '@/lib/household-replenishment/memory-store';
import { ReplenishmentService } from '@/lib/household-replenishment/service';
import type { PurchaseEvent, ReplenishmentNeed } from '@/lib/household-replenishment/types';

const OWNER = 'owner@example.com';
const MEMBER = 'member@example.com';

test('household guest authenticates but remains scoped to replenishment', () => {
  const env = {
    AUTH_ALLOWED_EMAILS: OWNER,
    HOUSEHOLD_MEMBER_EMAILS: MEMBER,
  };
  const identityEmails = resolveIdentityAllowedEmails(env);

  assert.deepEqual(resolveHouseholdMemberEmails(env), [MEMBER]);
  assert.equal(
    evaluateGoogleSignIn({
      provider: 'google',
      email: MEMBER,
      emailVerified: true,
      allowedEmails: identityEmails,
    }).ok,
    true,
  );

  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/hogar/reposicion',
      hasUser: true,
      email: MEMBER,
      allowedEmails: [OWNER],
      householdMemberEmails: [MEMBER],
    }),
    { action: 'next' },
  );

  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/salud',
      hasUser: true,
      email: MEMBER,
      allowedEmails: [OWNER],
      householdMemberEmails: [MEMBER],
    }),
    { action: 'redirect', pathname: '/unauthorized' },
  );

  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/api/household-replenishment',
      hasUser: true,
      email: MEMBER,
      allowedEmails: [OWNER],
      householdMemberEmails: [MEMBER],
    }),
    { action: 'next' },
  );
});

test('owner keeps normal Vida access and household access', () => {
  for (const pathname of ['/', '/salud', '/hogar/reposicion']) {
    assert.deepEqual(
      resolveAuthProxyDecision({
        pathname,
        hasUser: true,
        email: OWNER,
        allowedEmails: [OWNER],
        householdMemberEmails: [MEMBER],
      }),
      { action: 'next' },
    );
  }

  assert.deepEqual(
    evaluateHouseholdAccess({
      userId: 'owner-id',
      email: OWNER,
      vidaAllowedEmails: [OWNER],
      householdMemberEmails: [MEMBER],
    }),
    { ok: true, principalId: 'owner-id', role: 'OWNER' },
  );

  assert.deepEqual(
    evaluateHouseholdAccess({
      userId: 'member-id',
      email: MEMBER,
      vidaAllowedEmails: [OWNER],
      householdMemberEmails: [MEMBER],
    }),
    { ok: true, principalId: 'member-id', role: 'MEMBER' },
  );
});

function createServiceFixture() {
  let current = new Date('2026-01-01T12:00:00.000Z');
  let sequence = 0;
  const repository = new MemoryReplenishmentRepository({
    households: [
      { id: 'h1', name: 'Casa 1', createdAt: current.toISOString() },
      { id: 'h2', name: 'Casa 2', createdAt: current.toISOString() },
    ],
  });
  const service = new ReplenishmentService(repository, {
    now: () => current,
    id: () => `id-${++sequence}`,
  });

  return {
    repository,
    service,
    setNow(value: string) {
      current = new Date(value);
    },
  };
}

test('mark bought is idempotent and creates exactly one purchase event', async () => {
  const fixture = createServiceFixture();

  const added = await fixture.service.addManualNeed({
    householdId: 'h1',
    name: 'Detergente',
    seedIntervalDays: 30,
    operationId: 'operation-add-detergent',
    principalId: 'owner-id',
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;

  const needId = added.snapshot.buy[0]?.needId;
  assert.ok(needId);

  const first = await fixture.service.markBought({
    householdId: 'h1',
    needId,
    operationId: 'operation-buy-detergent',
    principalId: 'owner-id',
  });
  const replay = await fixture.service.markBought({
    householdId: 'h1',
    needId,
    operationId: 'operation-buy-detergent',
    principalId: 'owner-id',
  });
  const secondDistinctClick = await fixture.service.markBought({
    householdId: 'h1',
    needId,
    operationId: 'operation-buy-detergent-second-click',
    principalId: 'owner-id',
  });

  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(secondDistinctClick.ok, true);
  if (replay.ok) assert.equal(replay.code, 'idempotent');
  if (secondDistinctClick.ok) assert.equal(secondDistinctClick.code, 'existing');

  const purchases = await fixture.repository.listPurchaseEvents('h1', needId);
  assert.equal(purchases.length, 1);
});

test('repository and snapshots remain isolated by household', async () => {
  const fixture = createServiceFixture();

  await fixture.service.addManualNeed({
    householdId: 'h1',
    name: 'Shampoo',
    operationId: 'operation-add-h1-shampoo',
    principalId: 'owner-id',
  });
  await fixture.service.addManualNeed({
    householdId: 'h2',
    name: 'Café',
    operationId: 'operation-add-h2-coffee',
    principalId: 'member-id',
  });

  const h1 = await fixture.service.snapshot('h1');
  const h2 = await fixture.service.snapshot('h2');

  assert.deepEqual(
    h1.buy.map((entry) => entry.name),
    ['Shampoo'],
  );
  assert.deepEqual(
    h2.buy.map((entry) => entry.name),
    ['Café'],
  );
});

test('LOW correction forces an item back into Comprar even with little history', async () => {
  const fixture = createServiceFixture();
  const added = await fixture.service.addManualNeed({
    householdId: 'h1',
    name: 'Lavavajillas',
    seedIntervalDays: 30,
    operationId: 'operation-add-dish-soap',
    principalId: 'owner-id',
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;

  const needId = added.snapshot.buy[0]?.needId;
  assert.ok(needId);

  await fixture.service.markBought({
    householdId: 'h1',
    needId,
    operationId: 'operation-buy-dish-soap',
    principalId: 'owner-id',
  });

  fixture.setNow('2026-01-20T12:00:00.000Z');
  await fixture.service.correctNeed({
    householdId: 'h1',
    needId,
    type: 'LOW',
    operationId: 'operation-low-dish-soap',
    principalId: 'owner-id',
  });

  const snapshot = await fixture.service.snapshot('h1');
  assert.equal(
    snapshot.buy.some((entry) => entry.needId === needId),
    true,
  );
});

test('STILL_HAVE moves a regular prediction forward instead of immediately reappearing', () => {
  const need: ReplenishmentNeed = {
    id: 'need-1',
    householdId: 'h1',
    name: 'Papel higiénico',
    category: 'Higiene',
    manualSeedIntervalDays: 30,
    active: true,
    createdAt: '2025-12-01T12:00:00.000Z',
  };
  const purchaseDates = [
    '2026-01-01T12:00:00.000Z',
    '2026-01-31T12:00:00.000Z',
    '2026-03-02T12:00:00.000Z',
    '2026-04-01T12:00:00.000Z',
  ];
  const purchases: PurchaseEvent[] = purchaseDates.map((purchasedAt, index) => ({
    id: `purchase-${index}`,
    householdId: 'h1',
    needId: need.id,
    variantId: null,
    purchasedAt,
    source: 'AUTO',
    createdBy: 'owner-id',
    operationId: `operation-${index}`,
  }));

  const estimate = estimateCadence({
    need,
    purchases,
    corrections: [
      {
        id: 'correction-1',
        householdId: 'h1',
        needId: need.id,
        type: 'STILL_HAVE',
        occurredAt: '2026-05-10T12:00:00.000Z',
        createdBy: 'owner-id',
        operationId: 'operation-still-have',
      },
    ],
    now: new Date('2026-05-10T12:00:00.000Z'),
  });

  assert.equal(estimate.confidence, 'HIGH');
  assert.equal(estimate.state, 'NOT_DUE');
  assert.ok(estimate.nextExpectedAt);
  assert.ok(Date.parse(estimate.nextExpectedAt) > Date.parse('2026-05-10T12:00:00.000Z'));
});

test(
  'changing product variant keeps one need history and dedupes normalized variants',
  async () => {
    const fixture = createServiceFixture();

    const added = await fixture.service.addManualNeed({
      householdId: 'h1',
      name: 'Detergente para ropa',
      seedIntervalDays: 30,
      operationId: 'operation-add-laundry-detergent',
      principalId: 'owner-id',
    });
    assert.equal(added.ok, true);
    if (!added.ok) return;

    const needId = added.snapshot.buy[0]?.needId;
    assert.ok(needId);

    await fixture.service.markBought({
      householdId: 'h1',
      needId,
      variantName: 'Skip 3L',
      operationId: 'operation-buy-skip',
      principalId: 'owner-id',
    });

    fixture.setNow('2026-01-31T12:00:00.000Z');
    await fixture.service.addManualNeed({
      householdId: 'h1',
      name: 'Detergente para ropa',
      operationId: 'operation-readd-laundry-detergent-1',
      principalId: 'owner-id',
    });
    await fixture.service.markBought({
      householdId: 'h1',
      needId,
      variantName: 'Ala 3L',
      operationId: 'operation-buy-ala',
      principalId: 'owner-id',
    });

    fixture.setNow('2026-03-02T12:00:00.000Z');
    await fixture.service.addManualNeed({
      householdId: 'h1',
      name: 'Detergente para ropa',
      operationId: 'operation-readd-laundry-detergent-2',
      principalId: 'owner-id',
    });
    await fixture.service.markBought({
      householdId: 'h1',
      needId,
      variantName: '  skip 3l  ',
      operationId: 'operation-buy-skip-again',
      principalId: 'owner-id',
    });

    const variants = await fixture.repository.listVariants('h1', needId);
    assert.equal(variants.length, 2);
    assert.deepEqual(
      variants.map((variant) => variant.name).sort(),
      ['Ala 3L', 'Skip 3L'],
    );
    assert.equal(variants.filter((variant) => variant.preferred).length, 1);

    const purchases = await fixture.repository.listPurchaseEvents('h1', needId);
    assert.equal(purchases.length, 3);
    assert.equal(purchases.every((purchase) => purchase.needId === needId), true);
    assert.ok(purchases[0]?.variantId);
    assert.ok(purchases[1]?.variantId);
    assert.equal(purchases[0]?.variantId, purchases[2]?.variantId);
    assert.notEqual(purchases[0]?.variantId, purchases[1]?.variantId);

    const need = await fixture.repository.getNeed('h1', needId);
    assert.ok(need);
    const cadence = estimateCadence({
      need,
      purchases,
      corrections: [],
      now: new Date('2026-03-02T12:00:00.000Z'),
    });
    assert.equal(cadence.expectedIntervalDays, 30);
    assert.equal(cadence.observations, 3);
  },
);
