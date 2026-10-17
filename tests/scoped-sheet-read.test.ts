import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getScopedGoogleReadConfig,
  resolveScopedSheetReadTarget,
} from '@/lib/google/scoped-sheet-read';

const env = {
  VERCEL_ENV: 'production',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.invalid',
  GOOGLE_PRIVATE_KEY: 'test-key',
  GOOGLE_SHEETS_TARGET: 'prod',
  GOOGLE_SHEETS_DEV_ID: 'dev-test-sheet',
  GOOGLE_SHEETS_PROD_ID: 'prod-test-sheet',
};

test('V2 scoped read target is explicit, strict and fail-closed', () => {
  assert.equal(resolveScopedSheetReadTarget(undefined), null);
  assert.equal(resolveScopedSheetReadTarget(''), null);
  assert.equal(resolveScopedSheetReadTarget(' DEV '), null);
  assert.equal(resolveScopedSheetReadTarget('production'), null);
  assert.equal(resolveScopedSheetReadTarget('dev'), 'dev');
  assert.equal(resolveScopedSheetReadTarget('prod'), 'prod');
});

test('V2 read target uses DEV without changing global Production binding', () => {
  const original = { ...env };
  const scoped = getScopedGoogleReadConfig(env, 'dev');
  const shared = getScopedGoogleReadConfig(env);
  assert.equal(scoped.ok, true);
  if (scoped.ok) {
    assert.equal(scoped.config.target, 'dev');
    assert.equal(scoped.config.spreadsheetId, env.GOOGLE_SHEETS_DEV_ID);
  }
  assert.equal(shared.ok, true);
  if (shared.ok) {
    assert.equal(shared.config.target, 'prod');
    assert.equal(shared.config.spreadsheetId, env.GOOGLE_SHEETS_PROD_ID);
  }
  assert.deepEqual(env, original);
});

test('Preview cannot read Production Sheet even with explicit scoped target', () => {
  const result = getScopedGoogleReadConfig({ ...env, VERCEL_ENV: 'preview' }, 'prod');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'prod-forbidden-in-env');
});

test('missing selected workbook fails without cross-target fallback', () => {
  const result = getScopedGoogleReadConfig({ ...env, GOOGLE_SHEETS_DEV_ID: '' }, 'dev');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'missing-id');
});

test('V1 default scoped call preserves existing target resolution', () => {
  const result = getScopedGoogleReadConfig(env);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.config.target, 'prod');
});
