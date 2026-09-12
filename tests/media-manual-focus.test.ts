import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  columnNumberToA1,
  parseManualFocusRequest,
  resolveManualFocusTarget,
} from '@/lib/media/manual-focus';

test('request de lote manual acepta sólo contrato mínimo válido', () => {
  assert.deepEqual(parseManualFocusRequest({ key: 'movie:A:2020', medium: 'movie', level: 2 }), {
    key: 'movie:A:2020',
    medium: 'movie',
    level: 2,
  });
  assert.deepEqual(
    parseManualFocusRequest({ key: 'series:B:2021', medium: 'series', level: null }),
    {
      key: 'series:B:2021',
      medium: 'series',
      level: null,
    },
  );
  assert.equal(parseManualFocusRequest({ key: '', medium: 'movie', level: 1 }), null);
  assert.equal(parseManualFocusRequest({ key: 'x', medium: 'movie', level: 4 }), null);
  assert.equal(parseManualFocusRequest({ key: 'x', medium: 'book', level: 1 }), null);
});

test('resolver identifica una única celda Lote manual sin usar Media ID del cliente', () => {
  const values = [
    ['Media ID', 'Título', 'Año', 'Estado', 'Lote manual'],
    ['secret-1', 'Película A', 2020, 'Por ver', ''],
    ['secret-2', 'Película B', 2021, 'Por ver', ''],
  ];

  assert.deepEqual(resolveManualFocusTarget('movie', values, 'movie:Película B:2021'), {
    ok: true,
    rowNumber: 3,
    columnNumber: 5,
  });
});

test('resolver falla cerrado ante duplicado, estado no escribible o header ausente', () => {
  const duplicate = [
    ['Título', 'Año', 'Estado', 'Lote manual'],
    ['Duplicada', 2020, 'Por ver', ''],
    ['Duplicada', 2020, 'Por ver', ''],
  ];
  assert.deepEqual(resolveManualFocusTarget('movie', duplicate, 'movie:Duplicada:2020'), {
    ok: false,
    code: 'conflict',
  });

  const seen = [
    ['Título', 'Año', 'Estado', 'Lote manual'],
    ['Vista', 2020, 'Vista', ''],
  ];
  assert.deepEqual(resolveManualFocusTarget('movie', seen, 'movie:Vista:2020'), {
    ok: false,
    code: 'invalid-state',
  });

  assert.deepEqual(
    resolveManualFocusTarget('movie', [['Título', 'Año', 'Estado']], 'movie:X:2020'),
    { ok: false, code: 'missing-header' },
  );
});

test('conversión de columna a A1 cubre columnas de Media actuales', () => {
  assert.equal(columnNumberToA1(1), 'A');
  assert.equal(columnNumberToA1(26), 'Z');
  assert.equal(columnNumberToA1(27), 'AA');
  assert.equal(columnNumberToA1(41), 'AO');
  assert.equal(columnNumberToA1(43), 'AQ');
});
