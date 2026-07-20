import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isJsonPlain, sanitizeCell, sanitizeSheetValues, toPlainTodayData } from '@/lib/data/plain';
import {
  absorbGoogleFetchFailure,
  buildTodayFromGoogleResults,
  getTodayData,
} from '@/lib/data/source';
import { buildMockToday } from '@/lib/adapters/mock';
import { mapGoogleFailure } from '@/lib/google/sheets-read';
import { REGISTRO_DIARIO_HEADERS, SALUD_HEADERS } from '@/lib/google/constants';

test('sanitizeCell descarta Buffer y ArrayBuffer', () => {
  assert.equal(sanitizeCell(Buffer.from('hola')), 'hola');
  assert.equal(sanitizeCell(new ArrayBuffer(8)), null);
  assert.equal(sanitizeCell(new Uint8Array([1, 2])), null);
  assert.equal(sanitizeCell({ foo: 'bar' }), null);
});

test('sanitizeSheetValues produce una matriz JSON plana', () => {
  const values = sanitizeSheetValues([['texto', 0, false, Buffer.from('x'), new ArrayBuffer(4)]]);
  assert.deepEqual(values, [['texto', 0, false, 'x', null]]);
  assert.equal(isJsonPlain(values), true);
});

test('toPlainTodayData produce JSON serializable sin Error ni Buffer', () => {
  const mock = buildMockToday();
  const poisoned = {
    ...mock,
    __gaxios: new Error('leak') as unknown,
    __buffer: new ArrayBuffer(8) as unknown,
  };
  const plain = toPlainTodayData(poisoned as typeof mock);
  assert.equal(isJsonPlain(plain), true);
  const json = JSON.stringify(plain);
  assert.doesNotThrow(() => JSON.parse(json));
  assert.equal(json.includes('gaxios'), false);
});

test('mapGoogleFailure descarta GaxiosError con ArrayBuffer en response', () => {
  const gaxiosLike = {
    status: 401,
    message: 'Unauthorized',
    response: { status: 401, data: new ArrayBuffer(16) },
    config: { headers: { Authorization: 'secret' } },
  };
  assert.equal(mapGoogleFailure(gaxiosLike, 'Registro diario'), 'auth-error');
});

test('mapGoogleFailure mapea 403 a permission-error', () => {
  assert.equal(mapGoogleFailure({ status: 403 }, 'Salud y experimentos'), 'permission-error');
});

test('código auth-error produce fallback plano serializable', () => {
  const data = buildTodayFromGoogleResults(
    { ok: false, code: 'auth-error' },
    { ok: true, values: [[...SALUD_HEADERS]] },
  );
  assert.equal(data.status, 'auth-error');
  assert.match(data.notice ?? '', /autenticar/i);
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
  assert.equal(typeof data.summary.habits.value, 'string');
});

test('absorbGoogleFetchFailure captura Error con ArrayBuffer en cause', () => {
  const err = new Error('fallo simulado') as Error & {
    cause: { buffer: ArrayBuffer };
    response: { data: ArrayBuffer };
  };
  err.cause = { buffer: new ArrayBuffer(16) };
  err.response = { data: new ArrayBuffer(8) };

  const data = absorbGoogleFetchFailure(err);
  assert.equal(data.status, 'read-error');
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
});

test('DATA_SOURCE=mock devuelve datos planos serializables', async () => {
  const original = process.env.DATA_SOURCE;
  try {
    process.env.DATA_SOURCE = 'mock';
    const data = await getTodayData();
    assert.equal(data.source, 'mock');
    assert.equal(isJsonPlain(data), true);
    assert.doesNotThrow(() => JSON.stringify(data));
  } finally {
    if (original === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = original;
  }
});

test('DATA_SOURCE=google sin credenciales devuelve fallback plano', async () => {
  const keys = [
    'DATA_SOURCE',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SHEETS_DEV_ID',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.DATA_SOURCE = 'google';
    for (const k of keys.slice(1)) delete process.env[k];
    const data = await getTodayData();
    assert.equal(data.status, 'not-configured');
    assert.equal(isJsonPlain(data), true);
    assert.doesNotThrow(() => JSON.stringify(data));
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('buildTodayFromGoogleResults con datos válidos devuelve objeto plano', () => {
  const data = buildTodayFromGoogleResults(
    { ok: true, values: [[...REGISTRO_DIARIO_HEADERS]] },
    { ok: true, values: [[...SALUD_HEADERS]] },
  );
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
});
