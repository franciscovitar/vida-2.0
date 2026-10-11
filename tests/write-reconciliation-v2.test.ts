import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  reconcilePlanningV2Readback,
  type PlanningV2ReconcileKind,
} from '@/lib/daily-planning/write-reconciliation-v2';

const DAY = '2026-10-11';
const AT = '2026-10-11T14:00:00Z';
const digest = 'a'.repeat(64);
const executionHeader = [
  'Observation ID',
  'Fecha',
  'Registrado en',
  'Activity Type',
  'Domain',
  'Entity Type',
  'Canonical Ref',
  'Actividad',
  'Minutos declarados',
  'Inicio real',
  'Execution State',
  'Evidence State',
  'Progress Effect',
  'Source Class',
  'Confianza',
  'Evidence Refs JSON',
  'Version',
];
const orientationHeader = [
  'Snapshot ID',
  'Fecha',
  'Generado en',
  'Payload JSON',
  'Fuente',
  'Versión',
];
const assessmentHeader = [
  'Snapshot ID',
  'Assessment ID',
  'Subject ID',
  'Fecha evaluación',
  'Generado en',
  'Payload JSON',
  'Fuente',
  'Versión',
];
const executionRow: unknown[] = [
  'vida2:tasks-daily-planning:v2:execution:' + digest,
  DAY,
  AT,
  'study',
  'university',
  'subject',
  'subject-iop',
  'Práctica simulada',
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
const orientationJson = {
  review: { date: DAY, headline: 'Prueba', items: [], uncertainties: [] },
  attention: [],
  upcoming: [],
  lifeSignals: [],
  minimum: [],
  notNow: [],
};
const orientationRow: unknown[] = [
  'vida2:tasks-daily-planning:v2:orientation:' + DAY + ':' + digest,
  DAY,
  AT,
  JSON.stringify(orientationJson),
  'chatgpt_project',
  'daily-orientation-v2',
];
const assessmentJson = {
  name: 'Parcial 2',
  type: 'written-exam',
  status: 'planned',
  progressPercent: null,
  readinessBand: 'unknown',
};
const assessmentRow: unknown[] = [
  'vida2:assessment-progress:v1:' + digest,
  'exam',
  'iop',
  '',
  AT,
  JSON.stringify(assessmentJson),
  'chatgpt_subject_project',
  'assessment-progress-v1',
];
const fixtures: Record<PlanningV2ReconcileKind, { header: string[]; row: unknown[] }> = {
  execution: { header: executionHeader, row: executionRow },
  orientation: { header: orientationHeader, row: orientationRow },
  assessment: { header: assessmentHeader, row: assessmentRow },
};

function reconcile(
  kind: PlanningV2ReconcileKind,
  overrides: {
    candidateRow?: unknown[];
    rows?: unknown[][] | null;
    readStatus?: 'ready' | 'error';
    readComplete?: boolean;
  } = {},
) {
  const f = fixtures[kind];
  return reconcilePlanningV2Readback({
    kind,
    candidateRow: overrides.candidateRow ?? f.row,
    rows: overrides.rows === undefined ? [f.header, f.row] : overrides.rows,
    readStatus: overrides.readStatus ?? 'ready',
    readComplete: overrides.readComplete ?? true,
  });
}

test('one actual matching ID and payload confirms every transport', () => {
  for (const kind of ['execution', 'orientation', 'assessment'] as const) {
    assert.deepEqual(
      reconcile(kind),
      { status: 'confirmed', matchedRows: 1, retryAllowed: false },
      kind,
    );
  }
});
test('absence is uncertain, never authorizes a resend', () => {
  for (const kind of ['execution', 'orientation', 'assessment'] as const) {
    assert.deepEqual(reconcile(kind, { rows: [fixtures[kind].header] }), {
      status: 'not-observed-uncertain',
      matchedRows: 0,
      retryAllowed: false,
    });
  }
});
test('duplicate identical IDs are not accepted as one successful write', () => {
  for (const kind of ['execution', 'orientation', 'assessment'] as const) {
    const f = fixtures[kind];
    assert.deepEqual(reconcile(kind, { rows: [f.header, f.row, f.row] }), {
      status: 'duplicate',
      matchedRows: 2,
      retryAllowed: false,
    });
  }
});
test('different payload for same ID signals conflict, never overwrite', () => {
  const changed = [...executionRow];
  changed[7] = 'Falsified revision';
  assert.equal(reconcile('execution', { rows: [executionHeader, changed] }).status, 'conflict');
});
test('different source for same orientation ID is a conflict', () => {
  const changed = [...orientationRow];
  changed[4] = 'unauthorized';
  assert.equal(reconcile('orientation', { rows: [orientationHeader, changed] }).status, 'conflict');
});
test('mixed identical and conflicting duplicate IDs are duplicate (more than one physical row)', () => {
  const changed = [...orientationRow];
  changed[4] = 'altered';
  const result = reconcile('orientation', { rows: [orientationHeader, orientationRow, changed] });
  assert.equal(result.status, 'duplicate');
  assert.equal(result.matchedRows, 2);
});
test('generatedAt or recordedAt may differ without creating a new logical record', () => {
  for (const kind of ['execution', 'orientation', 'assessment'] as const) {
    const f = fixtures[kind];
    const at = kind === 'assessment' ? 4 : 2;
    const changed = [...f.row];
    changed[at] = '2026-10-12T05:15:00-03:00';
    assert.equal(reconcile(kind, { rows: [f.header, changed] }).status, 'confirmed', kind);
  }
});
test('payload JSON key reordering preserves semantic equality', () => {
  const f = fixtures.orientation;
  const changed = [...f.row];
  changed[3] = JSON.stringify({
    notNow: [],
    minimum: [],
    lifeSignals: [],
    upcoming: [],
    attention: [],
    review: { uncertainties: [], items: [], headline: 'Prueba', date: DAY },
  });
  assert.equal(reconcile('orientation', { rows: [f.header, changed] }).status, 'confirmed');
});
test('ordered evidence refs cannot be silently reordered', () => {
  const a = [...executionRow];
  a[15] = '["source:b","source:a"]';
  const b = [...a];
  b[15] = '["source:a","source:b"]';
  assert.equal(
    reconcile('execution', { candidateRow: a, rows: [executionHeader, b] }).status,
    'conflict',
  );
});
test('optional execution blanks from Sheets null sanitizer compare equal', () => {
  const stored = [...executionRow];
  stored[6] = null;
  stored[9] = null;
  const candidate = [...executionRow];
  candidate[6] = '';
  candidate[9] = '';
  assert.equal(
    reconcile('execution', { candidateRow: candidate, rows: [executionHeader, stored] }).status,
    'confirmed',
  );
});
test('optional assessment date null and empty are equivalent', () => {
  const stored = [...assessmentRow];
  stored[3] = null;
  assert.equal(reconcile('assessment', { rows: [assessmentHeader, stored] }).status, 'confirmed');
});
test('required cells are not normalized from missing/null to empty', () => {
  const stored = [...orientationRow];
  stored[4] = null;
  assert.equal(reconcile('orientation', { rows: [orientationHeader, stored] }).status, 'conflict');
});
test('numeric minutes must be real numbers, not string representations', () => {
  const changed = [...executionRow];
  changed[8] = '75';
  assert.equal(reconcile('execution', { rows: [executionHeader, changed] }).status, 'conflict');
});
test('payload JSON parse failure is conflict, not a successful echo', () => {
  const changed = [...orientationRow];
  changed[3] = '{broken';
  assert.equal(reconcile('orientation', { rows: [orientationHeader, changed] }).status, 'conflict');
});
test('impossible candidate ID or wrong version blocked', () => {
  const changed = [...executionRow];
  changed[0] = 'bad-id';
  assert.equal(reconcile('execution', { candidateRow: changed }).status, 'candidate-invalid');
  changed[0] = executionRow[0];
  changed[16] = 'wrong';
  assert.equal(reconcile('execution', { candidateRow: changed }).status, 'candidate-invalid');
});
test('orientation ID date must match explicit candidate date', () => {
  const changed = [...orientationRow];
  changed[1] = '2026-10-10';
  assert.equal(reconcile('orientation', { candidateRow: changed }).status, 'candidate-invalid');
});
test('candidate timestamps must have explicit timezone', () => {
  const changed = [...assessmentRow];
  changed[4] = '2026-10-11T14:00:00';
  assert.equal(reconcile('assessment', { candidateRow: changed }).status, 'candidate-invalid');
});
test('schema mismatch is explicitly blocked and not mistaken for absence', () => {
  assert.equal(
    reconcile('orientation', { rows: [['V1 header'], orientationRow] }).status,
    'schema-blocked',
  );
});
test('corrupt unrelated row blocks even when target row matches', () => {
  assert.equal(
    reconcile('execution', { rows: [executionHeader, executionRow, ['garbage']] }).status,
    'schema-blocked',
  );
});
test('empty rows are ignored without losing a valid target match', () => {
  assert.equal(
    reconcile('orientation', { rows: [orientationHeader, [], orientationRow, []] }).status,
    'confirmed',
  );
});
test('malformed null row blocks the store rather than throwing or confirming', () => {
  const corrupt = [orientationHeader, orientationRow, null] as unknown as unknown[][];
  assert.equal(reconcile('orientation', { rows: corrupt }).status, 'schema-blocked');
});
test('explicit read failures never mean an absent ID', () => {
  for (const input of [
    { readStatus: 'error' as const },
    { readComplete: false },
    { rows: null },
    { rows: [] },
  ]) {
    assert.equal(reconcile('assessment', input).status, 'unavailable');
  }
});
test('bounded read at 5000 rows is incomplete and cannot confirm or deny', () => {
  const rows = [orientationHeader, orientationRow, ...Array.from({ length: 4998 }, () => [])];
  assert.equal(rows.length, 5000);
  assert.equal(reconcile('orientation', { rows }).status, 'unavailable');
});
test('different valid IDs can coexist, target confirmed exactly once', () => {
  const other = [...executionRow];
  other[0] = 'vida2:tasks-daily-planning:v2:execution:' + 'b'.repeat(64);
  assert.equal(
    reconcile('execution', { rows: [executionHeader, other, executionRow] }).status,
    'confirmed',
  );
});
test('no private row values or IDs escape any result', () => {
  const response = reconcile('orientation');
  assert.equal(JSON.stringify(response).includes(String(orientationRow[0])), false);
  assert.equal(JSON.stringify(response).includes('Prueba'), false);
});
test('oversized or malformed candidate JSON is rejected', () => {
  const candidate = [...orientationRow];
  candidate[3] = 'x'.repeat(22 * 1024);
  assert.equal(reconcile('orientation', { candidateRow: candidate }).status, 'candidate-invalid');
});
