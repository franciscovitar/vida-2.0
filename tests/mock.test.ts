import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMockToday } from '@/lib/adapters/mock';

test('el modo mock funciona sin credenciales y conserva la salida aprobada', () => {
  const data = buildMockToday();

  assert.equal(data.source, 'mock');
  assert.equal(data.status, 'mock');
  assert.equal(data.notice, null);

  assert.equal(data.summary.habits.value, '2/5');
  assert.equal(data.summary.sleep.value, '7.7');
  assert.equal(data.summary.sleep.unit, 'h');

  assert.equal(data.health.sleep.value, '7 h 40 min');
  assert.equal(data.health.restingHeartRate.value, '54');

  assert.equal(data.productivity.active.value, '5 h 10 min');
  assert.equal(data.productivity.rows.length, 4);
  assert.equal(data.habits.length, 5);
  assert.equal(data.weekly.length, 5);
  assert.match(data.header.fullDate, /^Lunes/);
});
