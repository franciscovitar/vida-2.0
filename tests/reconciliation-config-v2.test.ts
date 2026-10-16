import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPlanningV2DevReadbackEnabled } from '@/lib/daily-planning/reconciliation-config-v2';

const dev = {
  PLANNING_V2_DEV_RECONCILIATION_READS_ENABLED: 'true',
  GOOGLE_SHEETS_TARGET: 'dev',
  GOOGLE_SHEETS_DEV_ID: 'mock-readback-dev-sheet',
  VERCEL_ENV: 'preview',
};

test('readback is OFF without its own dedicated flag', () => {
  assert.equal(isPlanningV2DevReadbackEnabled({}), false);
  assert.equal(
    isPlanningV2DevReadbackEnabled({
      ...dev,
      PLANNING_V2_DEV_RECONCILIATION_READS_ENABLED: 'false',
    }),
    false,
  );
  assert.equal(
    isPlanningV2DevReadbackEnabled({
      ...dev,
      PLANNING_V2_DEV_RECONCILIATION_READS_ENABLED: 'TRUE',
    }),
    false,
  );
});
test('readback is permitted only for a properly resolved DEV target', () => {
  assert.equal(isPlanningV2DevReadbackEnabled(dev), true);
  assert.equal(
    isPlanningV2DevReadbackEnabled({
      ...dev,
      GOOGLE_SHEETS_TARGET: 'prod',
      GOOGLE_SHEETS_PROD_ID: 'mock-prod-sheet',
    }),
    false,
  );
  assert.equal(isPlanningV2DevReadbackEnabled({ ...dev, GOOGLE_SHEETS_TARGET: undefined }), false);
  assert.equal(isPlanningV2DevReadbackEnabled({ ...dev, GOOGLE_SHEETS_DEV_ID: undefined }), false);
});
test('readback flag never activates Vercel Production', () => {
  assert.equal(isPlanningV2DevReadbackEnabled({ ...dev, VERCEL_ENV: 'production' }), false);
});
test('readback rejects DEV workbook that aliases the Production ID', () => {
  assert.equal(
    isPlanningV2DevReadbackEnabled({ ...dev, GOOGLE_SHEETS_PROD_ID: dev.GOOGLE_SHEETS_DEV_ID }),
    false,
  );
});
test('a distinct known Production workbook does not disable valid DEV readback', () => {
  assert.equal(
    isPlanningV2DevReadbackEnabled({ ...dev, GOOGLE_SHEETS_PROD_ID: 'mock-separate-production' }),
    true,
  );
});
