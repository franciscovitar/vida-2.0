import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';

const DAY = '2026-10-11';
const AT = '2026-10-11T09:30:00-03:00';
const EX = '5f3a8424a73a20ff8ed51f69aa00a29b935c6d65752763a767a2f97e9cc2458d';
const OR = '2a6a51a9e4a9feed2a347b96705e28963bb71a4302d942f62858601dca89c686';
const AS = '5afb1e6d497f2f29cce28787eb7b8d00a581bc0a50b92b7101de4c85defd23b4';

const execution: unknown[] = [
  'vida2:tasks-daily-planning:v2:execution:' + EX,
  DAY,
  AT,
  'study',
  'university',
  'subject',
  'subject-iop',
  'Práctica inventarios',
  75,
  '',
  'partial',
  'DECLARED',
  'unknown',
  'user_report',
  'Media',
  '[]',
  'planning-execution-v2',
];
const orientationPayload = {
  review: { date: DAY, headline: 'Prueba', items: [], uncertainties: [] },
  attention: [],
  upcoming: [],
  lifeSignals: [],
  minimum: [],
  notNow: [],
};
const orientation: unknown[] = [
  'vida2:tasks-daily-planning:v2:orientation:' + DAY + ':' + OR,
  DAY,
  AT,
  JSON.stringify(orientationPayload),
  'chatgpt_project',
  'daily-orientation-v2',
];
const assessmentPayload = {
  name: 'Parcial 2',
  type: 'written-exam',
  status: 'planned',
  progressPercent: null,
  progressConfidence: 'low',
  readinessBand: 'unknown',
  remainingMinutesLow: null,
  remainingMinutesHigh: null,
  etaConfidence: 'low',
  criticalGaps: [],
  nextBestActivity: null,
  scopeComplete: false,
  evidenceCount: 0,
};
const assessment: unknown[] = [
  'vida2:assessment-progress:v1:' + AS,
  'exam-id',
  'iop',
  '',
  AT,
  JSON.stringify(assessmentPayload),
  'chatgpt_subject_project',
  'assessment-progress-v1',
];
type Kind = 'execution' | 'orientation' | 'assessment';
const rows: Record<Kind, readonly unknown[]> = { execution, orientation, assessment };
function compile(
  kind: Kind,
  row: readonly unknown[] = rows[kind],
  opts: Partial<{ sheetId: number; target: 'dev' | 'prod' }> = {},
) {
  return compilePlanningV2AppendCells({
    kind,
    row,
    sheetId: opts.sheetId ?? 1234,
    target: opts.target ?? 'dev',
  });
}
test('execution SHA cross-language fixture generates EXACT 17 typed cells, no IO', () => {
  const got = compile('execution');
  assert.equal(got.ok, true);
  if (!got.ok) return;
  const op = got.request.requests[0].appendCells;
  assert.equal(op.sheetId, 1234);
  assert.equal(op.fields, 'userEnteredValue');
  assert.equal(op.rows[0].values.length, 17);
  assert.deepEqual(op.rows[0].values[8], { userEnteredValue: { numberValue: 75 } });
  assert.deepEqual(op.rows[0].values[1], { userEnteredValue: { stringValue: DAY } });
  assert.deepEqual(op.rows[0].values[2], { userEnteredValue: { stringValue: AT } });
  assert.deepEqual(op.rows[0].values[9], { userEnteredValue: { stringValue: '' } });
  assert.equal(got.request.includeSpreadsheetInResponse, false);
});
test('orientation SHA matches Python sorted canonical JSON and text stays literal', () => {
  const got = compile('orientation');
  assert.equal(got.ok, true);
  if (!got.ok) return;
  assert.equal(got.request.requests[0].appendCells.rows[0].values.length, 6);
  assert.deepEqual(got.request.requests[0].appendCells.rows[0].values[3], {
    userEnteredValue: { stringValue: JSON.stringify(orientationPayload) },
  });
});
test('unmeasured academic baseline SHA matches Python, cannot invent readiness', () => {
  const got = compile('assessment');
  assert.equal(got.ok, true);
  if (!got.ok) return;
  assert.equal(got.request.requests[0].appendCells.rows[0].values.length, 8);
  assert.deepEqual(got.request.requests[0].appendCells.rows[0].values[3], {
    userEnteredValue: { stringValue: '' },
  });
  assert.equal(assessmentPayload.readinessBand, 'unknown');
});
test('explicit PROD target never generates a write candidate', () => {
  for (const kind of ['execution', 'orientation', 'assessment'] as const) {
    assert.deepEqual(compile(kind, rows[kind], { target: 'prod' }), {
      ok: false,
      reason: 'blocked',
    });
  }
});
test('invalid, negative, floating and out-of-range sheet ID fail closed', () => {
  for (const n of [-1, 1.5, 2 ** 31, NaN, Infinity]) {
    assert.equal(compile('execution', execution, { sheetId: n }).ok, false);
  }
});
test('tampering with operational minutes invalidates the Python fingerprint', () => {
  const changed = [...execution];
  changed[8] = 76;
  assert.equal(compile('execution', changed).ok, false);
});
test('changing evidence/progress classification without new hash is rejected', () => {
  const changed = [...execution];
  changed[11] = 'VERIFIED';
  changed[12] = 'verified';
  assert.equal(compile('execution', changed).ok, false);
});
test('changing real start, class or correction reference invalidates identity', () => {
  const start = [...execution];
  start[9] = '12:05';
  const source = [...execution];
  source[13] = 'domain_fact';
  const ref = [...execution];
  ref[15] = '["source:evidence"]';
  for (const item of [start, source, ref]) assert.equal(compile('execution', item).ok, false);
});
test('unknown and malformed correction tokens cannot pass', () => {
  const changed = [...execution];
  changed[15] = '["correction-of:random"]';
  assert.equal(compile('execution', changed).ok, false);
});
test('invalid JSON and unbounded evidence arrays fail before Sheets', () => {
  const changed = [...execution];
  changed[15] = 'broken';
  const overflow = [...execution];
  overflow[15] = JSON.stringify(Array(10).fill('source:a'));
  assert.equal(compile('execution', changed).ok, false);
  assert.equal(compile('execution', overflow).ok, false);
});
test('orientation tampering with headline, day or source invalidates identity', () => {
  const headline = [...orientation];
  headline[3] = JSON.stringify({
    ...orientationPayload,
    review: { ...orientationPayload.review, headline: 'fake' },
  });
  const day = [...orientation];
  day[1] = '2026-10-10';
  const source = [...orientation];
  source[4] = 'unauthorized';
  for (const item of [headline, day, source]) assert.equal(compile('orientation', item).ok, false);
});
test('orientation oversized JSON is blocked', () => {
  const changed = [...orientation];
  changed[3] = JSON.stringify({
    ...orientationPayload,
    review: { ...orientationPayload.review, headline: 'x'.repeat(24000) },
  });
  assert.equal(compile('orientation', changed).ok, false);
});
test('baseline readiness percentage, ETA or new critical gaps are blocked', () => {
  const readiness = [...assessment];
  readiness[5] = JSON.stringify({ ...assessmentPayload, progressPercent: 95 });
  const eta = [...assessment];
  eta[5] = JSON.stringify({ ...assessmentPayload, remainingMinutesLow: 3 });
  const gap = [...assessment];
  gap[5] = JSON.stringify({ ...assessmentPayload, criticalGaps: ['made-up'] });
  for (const item of [readiness, eta, gap]) assert.equal(compile('assessment', item).ok, false);
});
test('wrong assessment reference or status is blocked', () => {
  const changed = [...assessment];
  changed[1] = 'wrong-entity';
  const status = [...assessment];
  status[5] = JSON.stringify({ ...assessmentPayload, status: 'done' });
  for (const item of [changed, status]) assert.equal(compile('assessment', item).ok, false);
});
test('formula-prefixed activity and unknown payload fields are blocked', () => {
  const changed = [...execution];
  changed[7] = '=IMPORTXML("x")';
  const payload = [...orientation];
  payload[3] = JSON.stringify({ ...orientationPayload, rawJournal: 'do not persist' });
  assert.equal(compile('execution', changed).ok, false);
  assert.equal(compile('orientation', payload).ok, false);
});
test('non-finite or negative minutes and boolean numeric cells are rejected', () => {
  for (const val of [-1, 1.1, Infinity, true]) {
    const changed = [...execution];
    changed[8] = val;
    assert.equal(compile('execution', changed).ok, false);
  }
});
test('missing timestamp timezone and wrong version blocked', () => {
  const stamp = [...execution];
  stamp[2] = '2026-10-11T12:00:00';
  const version = [...orientation];
  version[5] = 'legacy';
  assert.equal(compile('execution', stamp).ok, false);
  assert.equal(compile('orientation', version).ok, false);
});
test('replay of exact candidate yields identical data-only transport', () => {
  const a = compile('execution');
  assert.deepEqual(a, compile('execution'));
  assert.equal(JSON.stringify(a).includes('Bearer'), false);
});
test('a caller cannot append arbitrary cells without an ID from canonical Python', () => {
  const bad = [...execution];
  bad[0] = 'vida2:tasks-daily-planning:v2:execution:' + 'f'.repeat(64);
  assert.equal(compile('execution', bad).ok, false);
});

// Independently derive a sorted-content fingerprint for date boundary cases.
function orientationRowWithReviewDate(reviewDate: string): unknown[] {
  const body = { ...orientationPayload, review: { ...orientationPayload.review, date: reviewDate } };
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)]))
        : v;
  const id = createHash('sha256').update(JSON.stringify(sorted(body)), 'utf8').digest('hex');
  return [`vida2:tasks-daily-planning:v2:orientation:${DAY}:${id}`, DAY, AT, JSON.stringify(body), 'chatgpt_project', 'daily-orientation-v2'];
}

test('minimal orientation writer accepts yesterday review for todays plan', () => {
  const candidate = orientationRowWithReviewDate('2026-10-10');
  const result = compile('orientation', candidate);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.request.requests[0].appendCells.rows[0].values.length, 6);
});

test('minimal orientation writer blocks future and invalid review dates even with valid identity hash', () => {
  for (const day of ['2026-10-12', '2026-02-30']) {
    assert.equal(compile('orientation', orientationRowWithReviewDate(day)).ok, false);
  }
});

test('minimal orientation writer rejects nested private fields a lax reader would discard', () => {
  const body = {
    ...orientationPayload,
    review: { ...orientationPayload.review, rawJournal: 'private entry' },
  };
  const id = createHash('sha256').update('different', 'utf8').digest('hex');
  const candidate = [`vida2:tasks-daily-planning:v2:orientation:${DAY}:${id}`, DAY, AT, JSON.stringify(body), 'chatgpt_project', 'daily-orientation-v2'];
  assert.equal(compile('orientation', candidate).ok, false);
});
