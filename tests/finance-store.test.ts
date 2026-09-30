import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveFinanceStoreConfig } from '@/lib/finance/store/config-core';
import {
  buildFinanceRestUrl,
  financeMethodAllowed,
  withFinanceOwner,
} from '@/lib/finance/store/request-core';

const READY_ENV = {
  FINANCE_STORE_MODE: 'supabase-rest',
  FINANCE_SUPABASE_URL: 'https://abc123.supabase.co',
  FINANCE_SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  FINANCE_OWNER_KEY: 'primary',
};

test('finance store is disabled by default and never falls back to mocks', () => {
  assert.deepEqual(resolveFinanceStoreConfig({}), { status: 'disabled' });
});

test('finance store fails closed for partial or unsafe configuration', () => {
  assert.deepEqual(resolveFinanceStoreConfig({ FINANCE_STORE_MODE: 'other' }), {
    status: 'not-configured',
    issue: 'invalid-mode',
  });

  assert.deepEqual(
    resolveFinanceStoreConfig({
      ...READY_ENV,
      FINANCE_SUPABASE_URL: 'https://example.com',
    }),
    { status: 'not-configured', issue: 'invalid-url' },
  );

  assert.deepEqual(
    resolveFinanceStoreConfig({
      ...READY_ENV,
      FINANCE_SUPABASE_SERVICE_ROLE_KEY: '',
    }),
    { status: 'not-configured', issue: 'missing-service-role-key' },
  );
});

test('finance store enables writes only for the exact true literal', () => {
  const readonly = resolveFinanceStoreConfig(READY_ENV);
  assert.equal(readonly.status, 'ready');
  if (readonly.status !== 'ready') return;

  assert.equal(readonly.writesEnabled, false);
  assert.equal(financeMethodAllowed(readonly, 'GET'), true);
  assert.equal(financeMethodAllowed(readonly, 'POST'), false);
  assert.equal(financeMethodAllowed(readonly, 'PATCH'), false);

  const writable = resolveFinanceStoreConfig({
    ...READY_ENV,
    FINANCE_WRITES_ENABLED: 'true',
  });
  assert.equal(writable.status, 'ready');
  if (writable.status !== 'ready') return;

  assert.equal(writable.writesEnabled, true);
  assert.equal(financeMethodAllowed(writable, 'POST'), true);
  assert.equal(financeMethodAllowed(writable, 'PATCH'), true);
});

test('finance REST requests are always scoped to owner_key', () => {
  const config = resolveFinanceStoreConfig(READY_ENV);
  assert.equal(config.status, 'ready');
  if (config.status !== 'ready') return;

  const query = new URLSearchParams({ select: 'id,display_name', active: 'eq.true' });
  const url = buildFinanceRestUrl(config, 'finance_accounts', query);

  assert.equal(url.origin, 'https://abc123.supabase.co');
  assert.equal(url.pathname, '/rest/v1/finance_accounts');
  assert.equal(url.searchParams.get('owner_key'), 'eq.primary');
  assert.equal(url.searchParams.get('active'), 'eq.true');
});

test('finance writes inject owner_key and cannot be overridden by input', () => {
  assert.deepEqual(withFinanceOwner('primary', { owner_key: 'other', value: 1 }), {
    owner_key: 'primary',
    value: 1,
  });
});
