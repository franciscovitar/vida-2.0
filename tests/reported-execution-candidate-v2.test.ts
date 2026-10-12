import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  proposePlanningV2ReportedExecution,
} from '@/lib/daily-planning/reported-execution-candidate-v2';
import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';

const checkin = () => ({
  day: '2026-10-11',
  recordedAt: '2026-10-11T09:30:00-03:00',
  activityType: 'study',
  domain: 'university',
  entityType: 'subject',
  canonicalRef: 'subject-iop',
  activity: 'Práctica inventarios',
  declaredMinutes: 75,
  actualStart: null,
  executionState: 'partial',
});

test('produces an inert 17-cell DECLARED proposal matching existing deterministic fixture', () => {
  const proposed = proposePlanningV2ReportedExecution(checkin());
  assert.equal(proposed.status, 'candidate-only');
  if (proposed.status !== 'candidate-only') return;
  assert.equal(
    proposed.row[0],
    'vida2:tasks-daily-planning:v2:execution:5f3a8424a73a20ff8ed51f69aa00a29b935c6d65752763a767a2f97e9cc2458d',
  );
  assert.equal(proposed.row.length, 17);
  assert.deepEqual(proposed.row.slice(11, 17), [
    'DECLARED',
    'unknown',
    'user_report',
    'Media',
    '[]',
    'planning-execution-v2',
  ]);
  assert.equal(
    compilePlanningV2AppendCells({
      kind: 'execution',
      row: proposed.row,
      target: 'dev',
      sheetId: 0,
    }).ok,
    true,
  );
  assert.equal(Object.isFrozen(proposed.row), true);
});

test('repeated or differently formatted reporting yields the same observation ID', () => {
  const first = proposePlanningV2ReportedExecution(checkin());
  const second = proposePlanningV2ReportedExecution({
    ...checkin(),
    recordedAt: '2026-10-12T12:00:00Z',
    activity: '  Práctica   inventarios ',
  });
  assert.equal(first.status, 'candidate-only');
  assert.equal(second.status, 'candidate-only');
  if (first.status !== 'candidate-only' || second.status !== 'candidate-only') return;
  assert.equal(first.row[0], second.row[0]);
  assert.equal(second.row[7], 'Práctica inventarios');
});

test('changed explicit duration/state changes the identity, not an existing record', () => {
  const original = proposePlanningV2ReportedExecution(checkin());
  const changed = proposePlanningV2ReportedExecution({ ...checkin(), declaredMinutes: 76 });
  const state = proposePlanningV2ReportedExecution({ ...checkin(), executionState: 'completed' });
  for (const item of [original, changed, state]) assert.equal(item.status, 'candidate-only');
  if (
    original.status !== 'candidate-only' ||
    changed.status !== 'candidate-only' ||
    state.status !== 'candidate-only'
  ) return;
  assert.notEqual(original.row[0], changed.row[0]);
  assert.notEqual(original.row[0], state.row[0]);
});

test('no claimed consent, verified progress, account identity or raw journal can enter proposal', () => {
  for (const extra of [
    { consent: true },
    { actorId: 'some-authenticated-user' },
    { evidenceState: 'VERIFIED' },
    { progressEffect: 'verified' },
    { journalRaw: 'private diary' },
    { extraNotes: 'unstructured body' },
  ]) {
    assert.deepEqual(proposePlanningV2ReportedExecution({ ...checkin(), ...extra }), {
      status: 'blocked',
    });
  }
});

test('incomplete/invalid dates, times and quantities cannot become verified facts', () => {
  for (const broken of [
    { day: '2026-02-30' },
    { recordedAt: '2026-10-11' },
    { declaredMinutes: -1 },
    { declaredMinutes: 1441 },
    { declaredMinutes: 60.5 },
    { declaredMinutes: '75' },
    { actualStart: '24:00' },
    { executionState: 'mastered' },
    { domain: 'invented' },
    { canonicalRef: 'https://example.com' },
    { activity: '=HYPERLINK("https://example.com")' },
    { activity: 'a\nprivate text' },
    { activity: 'Check https://example.com' },
  ]) {
    assert.equal(
      proposePlanningV2ReportedExecution({ ...checkin(), ...broken }).status,
      'blocked',
    );
  }
});

test('no entity is invented when unresolved; unknown duration and time stay blank', () => {
  const proposed = proposePlanningV2ReportedExecution({
    ...checkin(),
    entityType: 'none',
    canonicalRef: null,
    declaredMinutes: null,
    actualStart: null,
  });
  assert.equal(proposed.status, 'candidate-only');
  if (proposed.status !== 'candidate-only') return;
  assert.equal(proposed.row[5], 'none');
  assert.equal(proposed.row[6], '');
  assert.equal(proposed.row[8], '');
  assert.equal(proposed.row[9], '');
});

test('missing or unknown input fields are blocked instead of inferred', () => {
  const missing = { ...checkin() } as Record<string, unknown>;
  delete missing.recordedAt;
  assert.equal(proposePlanningV2ReportedExecution(missing).status, 'blocked');
  assert.equal(proposePlanningV2ReportedExecution(null).status, 'blocked');
  assert.equal(proposePlanningV2ReportedExecution([]).status, 'blocked');
});
