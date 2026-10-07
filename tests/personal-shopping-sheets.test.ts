import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GoogleSheetsPersonalShoppingRepository } from '@/lib/personal-shopping/google-sheets-store';
import { buildLegacyPersonalShoppingMigrationPlan } from '@/lib/personal-shopping/migration-core';
import {
  hasPersonalShoppingHeaders,
  PERSONAL_SHOPPING_SCHEMA_VERSION,
  PERSONAL_SHOPPING_SHEETS,
} from '@/lib/personal-shopping/schema';
import { resolvePersonalShoppingStoreConfig } from '@/lib/personal-shopping/sheets-config';

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
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0] ?? '').split('!')[0] ?? null;
}

const READY_ENV = {
  PERSONAL_SHOPPING_STORE_MODE: 'google-sheets',
  GOOGLE_PERSONAL_SHOPPING_SPREADSHEET_ID: 'personal_shopping_sheet_1234567890',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'vida@example.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: 'line-1\\nline-2',
};

test('personal shopping store is disabled by default and fails closed when incomplete', () => {
  assert.deepEqual(resolvePersonalShoppingStoreConfig({}), { status: 'disabled' });
  assert.deepEqual(
    resolvePersonalShoppingStoreConfig({
      ...READY_ENV,
      GOOGLE_PERSONAL_SHOPPING_SPREADSHEET_ID: '',
    }),
    { status: 'not-configured', issue: 'missing-spreadsheet-id' },
  );
});

test('personal shopping store reuses Google credentials and has an independent write gate', () => {
  const readonly = resolvePersonalShoppingStoreConfig(READY_ENV);
  assert.equal(readonly.status, 'ready');
  if (readonly.status !== 'ready') return;
  assert.equal(readonly.privateKey, 'line-1\nline-2');
  assert.equal(readonly.writesEnabled, false);

  const writable = resolvePersonalShoppingStoreConfig({
    ...READY_ENV,
    PERSONAL_SHOPPING_WRITES_ENABLED: 'true',
  });
  assert.equal(writable.status, 'ready');
  if (writable.status !== 'ready') return;
  assert.equal(writable.writesEnabled, true);
});

test('personal shopping schema matches the provisioned Items / Events / Meta tabs', () => {
  assert.equal(PERSONAL_SHOPPING_SCHEMA_VERSION, 'personal-shopping-sheets-v1.0.0');
  assert.equal(PERSONAL_SHOPPING_SHEETS.items.title, 'Items');
  assert.equal(PERSONAL_SHOPPING_SHEETS.events.title, 'Events');
  assert.equal(PERSONAL_SHOPPING_SHEETS.meta.title, 'Meta');
  assert.equal(
    hasPersonalShoppingHeaders(
      [PERSONAL_SHOPPING_SHEETS.items.headers],
      PERSONAL_SHOPPING_SHEETS.items.headers,
    ),
    true,
  );
});

test('Google Sheets repository commits item + event mutations in one batch', async () => {
  const postedBodies: unknown[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    if (init?.method === 'POST') {
      postedBodies.push(JSON.parse(String(init.body)));
      return jsonResponse({});
    }

    const tab = tabFromUrl(input);
    if (tab === 'Items') {
      return jsonResponse({ values: [PERSONAL_SHOPPING_SHEETS.items.headers] });
    }
    if (tab === 'Events') {
      return jsonResponse({ values: [PERSONAL_SHOPPING_SHEETS.events.headers] });
    }
    throw new Error(`unexpected read: ${tab ?? 'unknown'}`);
  };

  const repository = new GoogleSheetsPersonalShoppingRepository(
    {
      clientEmail: 'vida@example.iam.gserviceaccount.com',
      privateKey: 'private-key',
      spreadsheetId: 'personal-shopping-sheet',
      writesEnabled: true,
    },
    {
      fetchImpl,
      tokenProvider: async () => ({ ok: true, token: 'test-token' }),
    },
  );

  const plan = buildLegacyPersonalShoppingMigrationPlan({
    existingItems: [],
    migratedAt: '2026-10-07T12:00:00.000Z',
  });

  await repository.saveItemsWithEvents(plan.toCreate.slice(0, 2));

  assert.equal(postedBodies.length, 1);
  const body = postedBodies[0] as { requests?: Record<string, unknown>[] };
  assert.equal(body.requests?.length, 4);
  assert.equal('appendCells' in (body.requests?.[0] ?? {}), true);
  assert.equal('appendCells' in (body.requests?.[1] ?? {}), true);
});

test('Google Sheets repository rejects writes while the Shopping write gate is off', async () => {
  const repository = new GoogleSheetsPersonalShoppingRepository(
    {
      clientEmail: 'vida@example.iam.gserviceaccount.com',
      privateKey: 'private-key',
      spreadsheetId: 'personal-shopping-sheet',
      writesEnabled: false,
    },
    {
      fetchImpl: async () => {
        throw new Error('fetch should not run');
      },
      tokenProvider: async () => ({ ok: true, token: 'test-token' }),
    },
  );
  const plan = buildLegacyPersonalShoppingMigrationPlan({
    existingItems: [],
    migratedAt: '2026-10-07T12:00:00.000Z',
  });

  await assert.rejects(
    () => repository.saveItemsWithEvents(plan.toCreate.slice(0, 1)),
    /writes are disabled/,
  );
});
