import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toBoolean, toNumber, toText } from '@/lib/adapters/cells';

test('el cero se conserva como valor (no se convierte en "sin datos")', () => {
  const cell = toNumber(0);
  assert.deepEqual(cell, { kind: 'value', value: 0 });
});

test('la celda vacía se conserva como vacía', () => {
  assert.deepEqual(toNumber(''), { kind: 'empty' });
  assert.deepEqual(toNumber(undefined), { kind: 'empty' });
  assert.deepEqual(toNumber(null), { kind: 'empty' });
  assert.deepEqual(toText('   '), { kind: 'empty' });
});

test('el false se conserva como false', () => {
  assert.deepEqual(toBoolean(false), { kind: 'value', value: false });
  assert.deepEqual(toBoolean('FALSO'), { kind: 'value', value: false });
  assert.deepEqual(toBoolean(0), { kind: 'value', value: false });
});

test('el true se interpreta correctamente', () => {
  assert.deepEqual(toBoolean(true), { kind: 'value', value: true });
  assert.deepEqual(toBoolean('Sí'), { kind: 'value', value: true });
});

test('contenido no interpretable produce error, distinto de vacío', () => {
  assert.equal(toNumber('abc').kind, 'error');
  assert.equal(toBoolean('quizás').kind, 'error');
});

test('números en texto con coma decimal se interpretan', () => {
  assert.deepEqual(toNumber('7,7'), { kind: 'value', value: 7.7 });
});
