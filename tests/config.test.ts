import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getDataSource, getGoogleConfig, normalizePrivateKey } from '@/lib/data/config';

test('normalizePrivateKey convierte los \\n literales en saltos de línea reales', () => {
  assert.equal(normalizePrivateKey('linea1\\nlinea2'), 'linea1\nlinea2');
  assert.equal(normalizePrivateKey('sin-saltos'), 'sin-saltos');
});

test('getDataSource usa mock por defecto y solo google cuando se pide explícitamente', () => {
  const original = process.env.DATA_SOURCE;
  try {
    delete process.env.DATA_SOURCE;
    assert.equal(getDataSource(), 'mock');
    process.env.DATA_SOURCE = 'mock';
    assert.equal(getDataSource(), 'mock');
    process.env.DATA_SOURCE = 'google';
    assert.equal(getDataSource(), 'google');
    process.env.DATA_SOURCE = 'algo-raro';
    assert.equal(getDataSource(), 'mock');
  } finally {
    if (original === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = original;
  }
});

test('sin credenciales, la configuración de Google reporta "not-configured"', () => {
  const keys = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SHEETS_DEV_ID'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    assert.deepEqual(getGoogleConfig(), { ok: false, reason: 'not-configured' });
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
