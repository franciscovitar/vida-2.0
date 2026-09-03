import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getWriteRuntimeStatus } from '@/lib/actions/config';
import { createGoogleSheetsValuesClient } from '@/lib/actions/gym-sheets';
import {
  getGymSpreadsheetId,
  getGymSheetsWriteConfig,
  type GymSheetsEnv,
} from '@/lib/gym/sheets-config';

const GYM_ID = 'gym_sheet_12345678901234567890';

function gymEnv(extra: GymSheetsEnv = {}): GymSheetsEnv {
  return {
    GOOGLE_GYM_SPREADSHEET_ID: GYM_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'gym@example.iam.gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n',
    ...extra,
  };
}

test('Gym Sheets usa el spreadsheet dedicado y no sustituye el target general', () => {
  const generalOnly = gymEnv({
    GOOGLE_GYM_SPREADSHEET_ID: undefined,
    GOOGLE_SHEETS_TARGET: 'dev',
    GOOGLE_SHEETS_DEV_ID: 'general_dev_12345678901234567890',
    GOOGLE_SHEETS_PROD_ID: 'general_prod_12345678901234567890',
    GOOGLE_GYM_SHEETS_ALLOW_WRITES: 'true',
  });

  assert.equal(getGymSpreadsheetId(generalOnly), null);
  assert.deepEqual(getGymSheetsWriteConfig(generalOnly), {
    ok: false,
    reason: 'not-configured',
  });

  const dedicated = getGymSheetsWriteConfig(gymEnv({ GOOGLE_GYM_SHEETS_ALLOW_WRITES: 'true' }));
  assert.equal(dedicated.ok, true);
  if (dedicated.ok) assert.equal(dedicated.config.spreadsheetId, GYM_ID);
});

test('Gym Sheets exige una compuerta de escritura adicional exacta', () => {
  assert.deepEqual(getGymSheetsWriteConfig(gymEnv()), {
    ok: false,
    reason: 'writes-disabled',
  });
  assert.deepEqual(getGymSheetsWriteConfig(gymEnv({ GOOGLE_GYM_SHEETS_ALLOW_WRITES: 'TRUE' })), {
    ok: false,
    reason: 'writes-disabled',
  });
  assert.equal(
    getGymSheetsWriteConfig(gymEnv({ GOOGLE_GYM_SHEETS_ALLOW_WRITES: 'true' })).ok,
    true,
  );
});

test('cliente Gym bloqueado no inicia I/O de Google', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('network should not be called');
  }) as typeof fetch;

  try {
    const client = createGoogleSheetsValuesClient(gymEnv());
    const result = await client.getValues('Gym Sessions!A1:L');
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('readiness Gym refleja la compuerta y el target dedicado', () => {
  const base = {
    ...gymEnv(),
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    WRITE_ACTIONS_ENABLED: 'true',
    SHEETS_GYM_SESSIONS_RANGE: 'Gym Sessions!A:L',
    SHEETS_GYM_SETS_RANGE: 'Gym Sets!A:J',
  };

  const blocked = getWriteRuntimeStatus(base);
  assert.equal(blocked.gym, 'misconfigured');
  assert.ok(blocked.issues.includes('gym-writes-disabled'));

  const ready = getWriteRuntimeStatus({ ...base, GOOGLE_GYM_SHEETS_ALLOW_WRITES: 'true' });
  assert.equal(ready.gym, 'ready');
  assert.equal(ready.issues.includes('gym-writes-disabled'), false);
  assert.equal(ready.issues.includes('gym-write-target-missing'), false);
});
