import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countConflictingOrientationIdRows } from '@/lib/daily-planning/orientation-id-integrity';

const DATE = '2026-10-11';
const HEADER = ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'];
const ID = 'vida2:tasks-daily-planning:v2:orientation:2026-10-11:example';
const payload = { review: { date: '2026-10-10', headline: 'Estudio' }, attention: [] };

function row(
  id = ID,
  body: unknown = payload,
  timestamp = '2026-10-11T09:00:00Z',
  source = 'chatgpt_project',
): unknown[] {
  return [id, DATE, timestamp, JSON.stringify(body), source, 'daily-orientation-v2'];
}

test('duplicate audit: a single row has no conflict', () => {
  assert.equal(countConflictingOrientationIdRows([HEADER, row()], DATE), 0);
});
test('duplicate audit: exact replay with a later write timestamp remains valid', () => {
  assert.equal(
    countConflictingOrientationIdRows(
      [HEADER, row(), row(ID, payload, '2026-10-11T10:00:00Z')],
      DATE,
    ),
    0,
  );
});
test('duplicate audit: key reordering does not cause false conflicts', () => {
  const reorder = { attention: [], review: { headline: 'Estudio', date: '2026-10-10' } };
  assert.equal(countConflictingOrientationIdRows([HEADER, row(), row(ID, reorder)], DATE), 0);
});
test('duplicate audit: one snapshot ID with distinct advice fails closed', () => {
  const changed = { review: { date: '2026-10-10', headline: 'Nada' }, attention: [] };
  assert.equal(countConflictingOrientationIdRows([HEADER, row(), row(ID, changed)], DATE), 2);
});
test('duplicate audit: same ID with a different source fails closed', () => {
  assert.equal(
    countConflictingOrientationIdRows(
      [HEADER, row(), row(ID, payload, undefined, 'unauthorized')],
      DATE,
    ),
    2,
  );
});
test('duplicate audit: one corrupt JSON row fails closed', () => {
  const broken = row();
  broken[3] = '{broken';
  assert.equal(countConflictingOrientationIdRows([HEADER, row(), broken], DATE), 2);
});
test('duplicate audit: replay after conflict does not clear that conflict', () => {
  const changed = { review: { date: '2026-10-10', headline: 'Nada' }, attention: [] };
  assert.equal(
    countConflictingOrientationIdRows([HEADER, row(), row(ID, changed), row()], DATE),
    2,
  );
});
test('duplicate audit: different IDs remain distinct versions', () => {
  const changed = { review: { date: '2026-10-10', headline: 'Nada' }, attention: [] };
  assert.equal(
    countConflictingOrientationIdRows([HEADER, row(), row(ID + '-new', changed)], DATE),
    0,
  );
});
test('duplicate audit: historical and V1 rows never contaminate todays V2', () => {
  const historical = row();
  historical[1] = '2026-10-10';
  const v1 = row();
  v1[5] = 'daily-plan-v1';
  assert.equal(countConflictingOrientationIdRows([HEADER, row(), historical, v1], DATE), 0);
});
test('duplicate audit: returns only a count, never sensitive source text', () => {
  const privateBody = { review: { headline: 'sensitive mock contents' } };
  const value = countConflictingOrientationIdRows([HEADER, row(), row(ID, privateBody)], DATE);
  assert.equal(value, 2);
});
test('duplicate audit: prototype-sensitive keys are preserved', () => {
  const a = JSON.parse('{"__proto__":{"a":1},"x":2}') as unknown;
  const b = JSON.parse('{"__proto__":{"a":2},"x":2}') as unknown;
  assert.equal(countConflictingOrientationIdRows([HEADER, row(ID, a), row(ID, b)], DATE), 2);
});
