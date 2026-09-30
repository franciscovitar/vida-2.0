import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveFinanceStoreConfig } from '@/lib/finance/store/config-core';
import {
  buildFinanceBatchRequests,
  type FinanceSheetIds,
} from '@/lib/finance/store/mutation-core';
import {
  assertFinanceRowWidth,
  FINANCE_SHEETS,
  FINANCE_SHEET_SCHEMA_VERSION,
  hasFinanceHeaders,
} from '@/lib/finance/store/schema';

const READY_ENV = {
  FINANCE_STORE_MODE: 'google-sheets',
  GOOGLE_FINANCE_SPREADSHEET_ID: 'finance_sheet_example_1234567890',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'vida@example.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nexample\\n-----END PRIVATE KEY-----',
};

test('finance store is disabled by default and never falls back to mocks', () => {
  assert.deepEqual(resolveFinanceStoreConfig({}), { status: 'disabled' });
});

test('finance store fails closed for incomplete configuration', () => {
  assert.deepEqual(resolveFinanceStoreConfig({ FINANCE_STORE_MODE: 'other' }), {
    status: 'not-configured',
    issue: 'invalid-mode',
  });

  assert.deepEqual(
    resolveFinanceStoreConfig({
      ...READY_ENV,
      GOOGLE_FINANCE_SPREADSHEET_ID: '',
    }),
    { status: 'not-configured', issue: 'missing-spreadsheet-id' },
  );

  assert.deepEqual(
    resolveFinanceStoreConfig({
      ...READY_ENV,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
    }),
    { status: 'not-configured', issue: 'missing-google-credentials' },
  );
});

test('finance store enables writes only for the exact true literal', () => {
  const readonly = resolveFinanceStoreConfig(READY_ENV);
  assert.equal(readonly.status, 'ready');
  if (readonly.status !== 'ready') return;

  assert.equal(readonly.mode, 'google-sheets');
  assert.equal(readonly.writesEnabled, false);

  const writable = resolveFinanceStoreConfig({
    ...READY_ENV,
    FINANCE_WRITES_ENABLED: 'true',
  });
  assert.equal(writable.status, 'ready');
  if (writable.status !== 'ready') return;
  assert.equal(writable.writesEnabled, true);
});

test('finance schema exposes the accepted V1 operational tabs', () => {
  assert.equal(FINANCE_SHEET_SCHEMA_VERSION, 'finance-sheets-v1.0.0');
  assert.equal(FINANCE_SHEETS.accounts.title, 'Accounts');
  assert.equal(FINANCE_SHEETS.postings.headers.includes('economic_role'), true);
  assert.equal(FINANCE_SHEETS.snapshots.headers.includes('safe_to_spend_minor'), true);
});

test('finance schema validates headers and exact row widths', () => {
  assert.equal(
    hasFinanceHeaders([FINANCE_SHEETS.accounts.headers], FINANCE_SHEETS.accounts.headers),
    true,
  );
  assert.equal(
    hasFinanceHeaders([['wrong']], FINANCE_SHEETS.accounts.headers),
    false,
  );

  assert.doesNotThrow(() =>
    assertFinanceRowWidth(
      'transactionSources',
      FINANCE_SHEETS.transactionSources.headers.map(() => null),
    ),
  );
  assert.throws(() => assertFinanceRowWidth('transactionSources', [null]), RangeError);
});

test('finance mutations build only typed append/update requests', () => {
  const ids: FinanceSheetIds = {
    accounts: 101,
    rules: 102,
  };

  const accountRow = FINANCE_SHEETS.accounts.headers.map((header) =>
    header === 'active' ? true : null,
  );
  const ruleRow = FINANCE_SHEETS.rules.headers.map(() => null);

  const requests = buildFinanceBatchRequests(ids, [
    { kind: 'append', sheet: 'accounts', rows: [accountRow] },
    { kind: 'update-row', sheet: 'rules', rowNumber: 2, values: ruleRow },
  ]);

  assert.equal(requests.length, 2);
  assert.equal('appendCells' in requests[0], true);
  assert.equal('updateCells' in requests[1], true);
  assert.throws(
    () =>
      buildFinanceBatchRequests(ids, [
        { kind: 'update-row', sheet: 'rules', rowNumber: 1, values: ruleRow },
      ]),
    RangeError,
  );
});
