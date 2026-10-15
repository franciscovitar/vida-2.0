import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMinimalOrientationCandidate,
  checkMinimalOrientationReadback,
} from '@/lib/daily-planning/minimal-orientation-candidate';
import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';
import { selectLatestDailyOrientationSnapshot } from '@/lib/daily-planning/orientation-v2';

const DATE = '2026-10-15';
const GENERATED = '2026-10-15T07:30:00-03:00';
const HEADER = ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'];
const payload = {
  review: {
    date: '2026-10-14',
    headline: 'Revisión declarada, pendiente de contrastar.',
    items: [],
    uncertainties: [],
  },
  attention: [],
  upcoming: [],
  lifeSignals: [],
  minimum: [],
  notNow: [],
};

function prepare(data: unknown = payload) {
  return buildMinimalOrientationCandidate({
    planDate: DATE,
    generatedAt: GENERATED,
    payload: data,
  });
}

test('MIN-C1: yesterday review becomes a strict six-cell today candidate', () => {
  const p = prepare();
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.equal(p.row.length, 6);
  assert.equal(p.row[1], DATE);
  assert.equal(p.row[4], 'chatgpt_project');
  assert.equal(p.row[5], 'daily-orientation-v2');
  assert.match(p.row[0], /^vida2:tasks-daily-planning:v2:orientation:2026-10-15:[a-f0-9]{64}$/);
  const compiled = compilePlanningV2AppendCells({
    kind: 'orientation', row: p.row, sheetId: 130076136, target: 'dev',
  });
  assert.equal(compiled.ok, true);
  assert.equal(selectLatestDailyOrientationSnapshot([HEADER, p.row], DATE).status, 'ready');
});

test('MIN-C2: repeat analysis yields same identity despite object key order or generatedAt', () => {
  const a = prepare();
  const reordered = {
    notNow: [], minimum: [], lifeSignals: [], upcoming: [], attention: [],
    review: { uncertainties: [], items: [], headline: payload.review.headline, date: '2026-10-14' },
  };
  const b = prepare(reordered);
  const c = buildMinimalOrientationCandidate({
    planDate: DATE,
    generatedAt: '2026-10-15T08:30:00-03:00',
    payload,
  });
  assert.equal(a.ok && b.ok && c.ok, true);
  if (!a.ok || !b.ok || !c.ok) return;
  assert.equal(a.row[0], b.row[0]);
  assert.equal(a.row[0], c.row[0]);
  assert.equal(a.row[3], b.row[3]);
});

test('MIN-C3: future/impossible review and unexpected personal fields fail closed', () => {
  for (const day of ['2026-10-16', '2026-02-30']) {
    assert.equal(prepare({ ...payload, review: { ...payload.review, date: day } }).ok, false);
  }
  assert.equal(prepare({ ...payload, review: { ...payload.review, rawJournal: 'do not copy' } }).ok, false);
  assert.equal(prepare({ ...payload, privateHealthNotes: 'do not copy' }).ok, false);
});

test('MIN-C4: bad target/clock cannot yield a row', () => {
  assert.equal(buildMinimalOrientationCandidate({
    planDate: '2026-10-32', generatedAt: GENERATED, payload,
  }).ok, false);
  assert.equal(buildMinimalOrientationCandidate({
    planDate: DATE, generatedAt: '2026-10-15T07:30:00', payload,
  }).ok, false);
});

test('MIN-C5: confirmed readback must also parse in Vida and match current snapshot', () => {
  const candidate = prepare();
  assert.equal(candidate.ok, true);
  if (!candidate.ok) return;
  const rows = [HEADER, candidate.row];
  assert.equal(checkMinimalOrientationReadback({
    candidate: candidate.row, rows, readComplete: true, readStatus: 'ready',
  }), 'confirmed-current');
  assert.equal(checkMinimalOrientationReadback({
    candidate: candidate.row, rows: [HEADER], readComplete: true, readStatus: 'ready',
  }), 'absent-or-uncertain');
  assert.equal(checkMinimalOrientationReadback({
    candidate: candidate.row, rows, readComplete: false, readStatus: 'ready',
  }), 'blocked');
});

test('MIN-C6: duplicate or conflicting identity never proves visible readback', () => {
  const candidate = prepare();
  assert.equal(candidate.ok, true);
  if (!candidate.ok) return;
  assert.equal(checkMinimalOrientationReadback({
    candidate: candidate.row, rows: [HEADER, candidate.row, candidate.row],
    readComplete: true, readStatus: 'ready',
  }), 'blocked');
  const conflict = [...candidate.row];
  conflict[3] = JSON.stringify({ ...payload, review: { ...payload.review, headline: 'Conflicting change' } });
  assert.equal(checkMinimalOrientationReadback({
    candidate: candidate.row, rows: [HEADER, candidate.row, conflict],
    readComplete: true, readStatus: 'ready',
  }), 'blocked');
});

test('MIN-C7: compiler never authorizes production append by this candidate', () => {
  const candidate = prepare();
  assert.equal(candidate.ok, true);
  if (!candidate.ok) return;
  assert.deepEqual(compilePlanningV2AppendCells({
    kind: 'orientation', row: candidate.row, sheetId: 130076136, target: 'prod',
  }), { ok: false, reason: 'blocked' });
});
