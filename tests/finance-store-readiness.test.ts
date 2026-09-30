import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateFinanceMeta } from '@/lib/finance/store/meta-core';
import { FINANCE_SHEET_SCHEMA_VERSION } from '@/lib/finance/store/schema';

const HEADER = ['key', 'value', 'updated_at', 'notes'];

test('finance meta accepts the canonical schema with writes declared false', () => {
  const result = validateFinanceMeta([
    HEADER,
    ['schema_version', FINANCE_SHEET_SCHEMA_VERSION, '2026-09-30', ''],
    ['writes_enabled', 'false', '2026-09-30', ''],
  ]);

  assert.deepEqual(result, {
    ok: true,
    schemaVersion: FINANCE_SHEET_SCHEMA_VERSION,
    declaredWritesEnabled: false,
  });
});

test('finance meta rejects schema drift', () => {
  assert.deepEqual(
    validateFinanceMeta([
      HEADER,
      ['schema_version', 'finance-sheets-v0', '2026-09-30', ''],
      ['writes_enabled', 'false', '2026-09-30', ''],
    ]),
    { ok: false, reason: 'schema-mismatch' },
  );
});

test('finance meta rejects an ambiguous writes flag', () => {
  assert.deepEqual(
    validateFinanceMeta([
      HEADER,
      ['schema_version', FINANCE_SHEET_SCHEMA_VERSION, '2026-09-30', ''],
      ['writes_enabled', 'maybe', '2026-09-30', ''],
    ]),
    { ok: false, reason: 'invalid-writes-flag' },
  );
});
