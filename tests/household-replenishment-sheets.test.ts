import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GoogleSheetsReplenishmentRepository } from '@/lib/household-replenishment/google-sheets-store';
import { getHouseholdReplenishmentSheetsConfig } from '@/lib/household-replenishment/sheets-config';
import type {
  PurchaseEvent,
  ReplenishmentNeed,
  ShoppingListItem,
} from '@/lib/household-replenishment/types';

const HEADERS = {
  Needs: [
    'id',
    'household_id',
    'name',
    'category',
    'manual_seed_interval_days',
    'active',
    'created_at',
  ],
  ShoppingItems: ['id', 'household_id', 'need_id', 'origin', 'state', 'added_at', 'operation_id'],
  Operations: ['household_id', 'operation_id', 'recorded_at'],
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tabFromUrl(input: string | URL | Request): string | null {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const marker = '/values/';
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const encoded = url.slice(index + marker.length).split('?')[0] ?? '';
  return decodeURIComponent(encoded).split('!')[0] ?? null;
}

test('household sheets config reuses the existing Google service account', () => {
  const config = getHouseholdReplenishmentSheetsConfig({
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'vida@example.iam.gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: 'line-1\\nline-2',
    HOUSEHOLD_REPLENISHMENT_SHEET_ID: 'sheet-123',
  });

  assert.deepEqual(config, {
    clientEmail: 'vida@example.iam.gserviceaccount.com',
    privateKey: 'line-1\nline-2',
    spreadsheetId: 'sheet-123',
  });
});

test('household sheets config fails closed when the dedicated sheet is missing', () => {
  assert.equal(
    getHouseholdReplenishmentSheetsConfig({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'vida@example.iam.gserviceaccount.com',
      GOOGLE_PRIVATE_KEY: 'private-key',
    }),
    null,
  );
});

test('Google Sheets repository commits a mutation as one atomic batch', async () => {
  const postedBodies: unknown[] = [];
  const existingShoppingItem: ShoppingListItem = {
    id: 'item-1',
    householdId: 'primary-household',
    needId: 'need-existing',
    origin: 'MANUAL',
    state: 'ACTIVE',
    addedAt: '2026-09-01T12:00:00.000Z',
    operationId: 'operation-add-existing',
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    if (init?.method === 'POST') {
      postedBodies.push(JSON.parse(String(init.body)));
      return jsonResponse({});
    }

    const tab = tabFromUrl(input);
    if (tab === 'Needs') {
      return jsonResponse({ values: [HEADERS.Needs] });
    }
    if (tab === 'ShoppingItems') {
      return jsonResponse({
        values: [
          HEADERS.ShoppingItems,
          [
            existingShoppingItem.id,
            existingShoppingItem.householdId,
            existingShoppingItem.needId,
            existingShoppingItem.origin,
            existingShoppingItem.state,
            existingShoppingItem.addedAt,
            existingShoppingItem.operationId,
          ],
        ],
      });
    }

    throw new Error(`unexpected read: ${tab ?? 'unknown'}`);
  };

  const repository = new GoogleSheetsReplenishmentRepository(
    {
      clientEmail: 'vida@example.iam.gserviceaccount.com',
      privateKey: 'private-key',
      spreadsheetId: 'sheet-123',
    },
    {
      fetchImpl,
      tokenProvider: async () => ({ ok: true, token: 'test-token' }),
      now: () => new Date('2026-09-28T21:45:00.000Z'),
    },
  );

  const need: ReplenishmentNeed = {
    id: 'need-new',
    householdId: 'primary-household',
    name: 'Detergente',
    category: 'Otros',
    manualSeedIntervalDays: 30,
    active: true,
    createdAt: '2026-09-28T21:45:00.000Z',
  };
  await repository.putNeed(need);
  await repository.putShoppingItem({ ...existingShoppingItem, state: 'BOUGHT' });

  const purchase: PurchaseEvent = {
    id: 'purchase-1',
    householdId: 'primary-household',
    needId: existingShoppingItem.needId,
    purchasedAt: '2026-09-28T21:45:00.000Z',
    source: 'MANUAL',
    createdBy: 'owner-id',
    operationId: 'operation-buy-existing',
  };
  await repository.appendPurchaseEvent(purchase);
  await repository.recordOperation('primary-household', purchase.operationId);

  assert.equal(postedBodies.length, 1);
  const body = postedBodies[0] as { requests?: Record<string, unknown>[] };
  assert.equal(body.requests?.length, 4);
  assert.ok(body.requests?.[0]?.appendCells);
  assert.ok(body.requests?.[1]?.updateCells);
  assert.ok(body.requests?.[2]?.appendCells);
  assert.ok(body.requests?.[3]?.appendCells);
});

test('Google Sheets operation ledger makes retries observable', async () => {
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.notEqual(init?.method, 'POST');
    const tab = tabFromUrl(input);
    assert.equal(tab, 'Operations');
    return jsonResponse({
      values: [
        HEADERS.Operations,
        ['primary-household', 'operation-abc', '2026-09-28T21:45:00.000Z'],
      ],
    });
  };

  const repository = new GoogleSheetsReplenishmentRepository(
    {
      clientEmail: 'vida@example.iam.gserviceaccount.com',
      privateKey: 'private-key',
      spreadsheetId: 'sheet-123',
    },
    {
      fetchImpl,
      tokenProvider: async () => ({ ok: true, token: 'test-token' }),
    },
  );

  assert.equal(await repository.hasOperation('primary-household', 'operation-abc'), true);
  assert.equal(await repository.hasOperation('primary-household', 'operation-other'), false);
});
