import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  ASSESSMENT_CLOSEOUT_WRITER_MODE,
  buildAssessmentCloseoutCandidate,
  type AssessmentCloseoutContext,
} from '@/lib/assessment-progress/closeout-candidate';
import {
  planAssessmentCloseoutDispatch,
  planAssessmentCloseoutReadback,
  type AssessmentDispatchModel,
  type AssessmentCloseoutRead,
} from '@/lib/assessment-progress/closeout-dispatch-model';
import { selectLatestAssessmentProgressSnapshots } from '@/lib/assessment-progress/snapshot';
import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';

// Entirely synthetic assessments, evidence, dates and identities. No PAS rows.
const hash = (character: string) => character.repeat(64);
const HEADER = [
  'Snapshot ID',
  'Assessment ID',
  'Subject ID',
  'Fecha evaluación',
  'Generado en',
  'Payload JSON',
  'Fuente',
  'Versión',
];
function context(): AssessmentCloseoutContext {
  return {
    actorHash: hash('a'),
    writerHash: hash('b'),
    authorizedCloseoutId: 'synthetic-session-1',
    target: {
      environment: 'dev',
      workbookHash: hash('c'),
      productionWorkbookHash: hash('d'),
      sheetId: 42,
    },
    assessment: {
      id: 'synthetic-assessment-a',
      subjectId: 'iop',
      name: 'Evaluación sintética A',
      type: 'written-exam',
      date: null,
      dateSource: 'unavailable',
      metric: 'assessment-weighted-readiness',
      pasMainSha: 'e'.repeat(40),
    },
  };
}
function closeout() {
  return {
    closeoutId: 'synthetic-session-1',
    generatedAt: '2030-01-02T12:00:00Z',
    payload: {
      name: 'Evaluación sintética A',
      type: 'written-exam',
      status: 'active',
      progressPercent: null as number | null,
      progressConfidence: 'low',
      readinessBand: 'unknown',
      remainingMinutesLow: null as number | null,
      remainingMinutesHigh: null as number | null,
      etaConfidence: 'low',
      criticalGaps: [] as string[],
      nextBestActivity: null as string | null,
      scopeComplete: false,
      evidenceCount: 0,
    },
    basis: {
      metric: 'unmeasured',
      scopeDigest: null as string | null,
      modelDigest: null as string | null,
      evidenceDigest: null as string | null,
      etaCalibrationDigest: null as string | null,
    },
  };
}
function candidate(input = closeout(), ctx = context()) {
  const result = buildAssessmentCloseoutCandidate(input, ctx);
  assert.ok(result);
  return result;
}
const completeRead = (
  rows: readonly (readonly unknown[])[] = [HEADER],
): AssessmentCloseoutRead => ({ rows, readStatus: 'ready', readComplete: true });
function state(input = closeout(), ctx = context()): AssessmentDispatchModel {
  return { revision: 0, binding: candidate(input, ctx).binding, activeIntent: null, receipts: {} };
}
function dispatch(
  current: AssessmentDispatchModel | null = state(),
  input = closeout(),
  ctx: AssessmentCloseoutContext | null = context(),
  read = completeRead(),
  expectedRevision = current?.revision ?? 0,
) {
  return planAssessmentCloseoutDispatch({
    state: current,
    expectedRevision,
    closeout: input,
    context: ctx,
    read,
  });
}
function recover(
  current: AssessmentDispatchModel,
  read: AssessmentCloseoutRead,
  input = closeout(),
  ctx = context(),
) {
  return planAssessmentCloseoutReadback({
    state: current,
    expectedRevision: current.revision,
    closeout: input,
    context: ctx,
    read,
  });
}
function measured() {
  const input = closeout();
  Object.assign(input.payload, {
    progressPercent: 50,
    progressConfidence: 'medium',
    readinessBand: 'developing',
    scopeComplete: true,
    evidenceCount: 2,
  });
  Object.assign(input.basis, {
    metric: 'assessment-weighted-readiness',
    scopeDigest: hash('1'),
    modelDigest: hash('2'),
    evidenceDigest: hash('3'),
  });
  return input;
}

test('null remains Sin medir and the real reader accepts the eight-cell contract', () => {
  const row = candidate().row;
  const read = selectLatestAssessmentProgressSnapshots([HEADER, row]);
  assert.equal(read.status, 'ready');
  assert.equal(read.snapshots[0].payload.progressPercent, null);
  assert.equal(read.snapshots[0].payload.evidenceCount, 0);
  assert.equal(row.length, 8);
});

test('same content preserves the existing baseline identity, excluding generatedAt', () => {
  const first = candidate();
  assert.equal(
    compilePlanningV2AppendCells({ kind: 'assessment', row: first.row, sheetId: 42, target: 'dev' })
      .ok,
    true,
  );
  const input = closeout();
  input.generatedAt = '2030-01-03T12:00:00Z';
  assert.equal(candidate(input).row[0], first.row[0]);
  assert.equal(candidate(input).intentId, first.intentId);
  assert.notEqual(candidate(input).digest, first.digest);
});

test('canonical percent requires complete scope, model and actual evidence provenance', () => {
  assert.ok(buildAssessmentCloseoutCandidate(measured(), context()));
  for (const field of ['scopeDigest', 'modelDigest', 'evidenceDigest'] as const) {
    const input = measured();
    input.basis[field] = null;
    assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
  }
  const input = measured();
  input.payload.scopeComplete = false;
  assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
  input.payload.scopeComplete = true;
  input.payload.evidenceCount = 0;
  assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
});

test('partial observed work can update gaps/evidence while canonical percent stays null', () => {
  const input = closeout();
  input.payload.evidenceCount = 1;
  input.payload.criticalGaps = ['Verificar operación sintética'];
  input.payload.nextBestActivity = 'Resolver una variante sintética';
  input.basis.evidenceDigest = hash('1');
  assert.notEqual(candidate(input).row[0], candidate().row[0]);
  input.basis.evidenceDigest = null;
  assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
});

test('proxy, transcript and unknown fields are rejected rather than silently persisted', () => {
  for (const field of ['conversationalProxy', 'effectiveCoverage', 'transcript', 'rawEvidence']) {
    assert.equal(buildAssessmentCloseoutCandidate({ ...closeout(), [field]: 80 }, context()), null);
    const input = closeout();
    assert.equal(
      buildAssessmentCloseoutCandidate(
        { ...input, payload: { ...input.payload, [field]: 80 } },
        context(),
      ),
      null,
    );
    assert.equal(
      buildAssessmentCloseoutCandidate(
        { ...input, basis: { ...input.basis, [field]: 80 } },
        context(),
      ),
      null,
    );
  }
  const input = measured();
  input.basis.metric = 'conversational-proxy';
  assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
});

test('requirements progress and oral readiness have different assessment identities and metrics', () => {
  const ctx = context();
  ctx.assessment.id = 'synthetic-delivery';
  ctx.assessment.type = 'assignment';
  ctx.assessment.metric = 'verified-requirements';
  const input = measured();
  input.payload.type = 'assignment';
  input.payload.readinessBand = 'unknown';
  input.basis.metric = 'verified-requirements';
  const delivery = candidate(input, ctx);
  input.payload.readinessBand = 'exam-ready';
  assert.equal(buildAssessmentCloseoutCandidate(input, ctx), null);
  input.payload.readinessBand = 'developing';
  input.basis.metric = 'assessment-weighted-readiness';
  assert.equal(buildAssessmentCloseoutCandidate(input, ctx), null);
  ctx.assessment.id = 'synthetic-defense';
  ctx.assessment.type = 'oral-exam';
  ctx.assessment.metric = 'assessment-weighted-readiness';
  input.payload.type = 'oral-exam';
  const defense = candidate(input, ctx);
  assert.notEqual(defense.intentId, delivery.intentId);
  assert.notEqual(defense.row[0], delivery.row[0]);
});

test('all seven subject owners use the same projection without inventing assessment IDs', () => {
  for (const subjectId of ['iop', 'cdd', 'dsi', 'dao', 'redes', 'tpa', 'green']) {
    const ctx = context();
    ctx.assessment.subjectId = subjectId;
    assert.ok(buildAssessmentCloseoutCandidate(closeout(), ctx));
  }
  const ctx = context();
  ctx.assessment.id = '';
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
  ctx.assessment.id = 'synthetic-assessment-a';
  ctx.assessment.subjectId = 'unresolved-owner';
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
});

test('official, Calendar and reported dates preserve provenance and cannot be fabricated from missing dates', () => {
  const digests = new Set<string>();
  for (const dateSource of ['official', 'calendar', 'user-reported'] as const) {
    const ctx = context();
    ctx.assessment.date = '2030-02-01';
    ctx.assessment.dateSource = dateSource;
    digests.add(candidate(closeout(), ctx).digest);
  }
  assert.equal(digests.size, 3);
  const ctx = context();
  ctx.assessment.date = '2030-02-30';
  ctx.assessment.dateSource = 'official';
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
  ctx.assessment.date = null;
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
});

test('ETA requires calibrated evidence and a complete ordered range', () => {
  const input = closeout();
  input.payload.remainingMinutesLow = 30;
  input.payload.remainingMinutesHigh = 60;
  assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
  input.basis.etaCalibrationDigest = hash('1');
  assert.ok(buildAssessmentCloseoutCandidate(input, context()));
  input.payload.remainingMinutesHigh = null;
  assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
  input.payload.remainingMinutesHigh = 20;
  assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
});

test('absent authorized issuer or a different closeout authorization blocks the candidate', () => {
  assert.equal(dispatch(state(), closeout(), null).status, 'blocked');
  const ctx = context();
  ctx.authorizedCloseoutId = 'another-event';
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
  ctx.authorizedCloseoutId = closeout().closeoutId;
  ctx.actorHash = '';
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
});

test('malformed payload or local timestamps never reach a dispatch proposal', () => {
  assert.equal(buildAssessmentCloseoutCandidate(null, context()), null);
  assert.equal(
    buildAssessmentCloseoutCandidate(
      { ...closeout(), payload: { progressPercent: 80 } },
      context(),
    ),
    null,
  );
  const input = closeout();
  for (const timestamp of [
    '2030-01-02T12:00:00',
    '2030-01-02Z',
    '2030-01-02T24:00:00Z',
    '2030-02-30T12:00:00Z',
    'not-a-date',
  ]) {
    input.generatedAt = timestamp;
    assert.equal(buildAssessmentCloseoutCandidate(input, context()), null);
  }
});

test('Production or a DEV workbook equal to Production is blocked', () => {
  const ctx = context();
  Object.assign(ctx.target, { environment: 'prod' });
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
  ctx.target.environment = 'dev';
  ctx.target.workbookHash = ctx.target.productionWorkbookHash;
  assert.equal(buildAssessmentCloseoutCandidate(closeout(), ctx), null);
});

test('changing writer, actor, workbook or tab cannot escape the existing binding', () => {
  for (const change of ['writer', 'actor', 'workbook', 'sheet']) {
    const ctx = context();
    if (change === 'writer') ctx.writerHash = hash('f');
    if (change === 'actor') ctx.actorHash = hash('f');
    if (change === 'workbook') ctx.target.workbookHash = hash('f');
    if (change === 'sheet') ctx.target.sheetId++;
    assert.equal(dispatch(state(), closeout(), ctx).status, 'blocked');
  }
});

test('missing ledger and corrupted or stale revisions are fail closed, never reseeded', () => {
  assert.equal(dispatch(null).status, 'blocked');
  assert.equal(dispatch({ ...state(), activeIntent: hash('a') }).status, 'blocked');
  assert.equal(dispatch(state(), closeout(), context(), completeRead(), 99).status, 'blocked');
  assert.equal(dispatch({ ...state(), revision: Number.MAX_SAFE_INTEGER }).status, 'blocked');
});

test('a proposal atomically reserves the global slot and records dispatch before the provider', () => {
  const initial = state();
  const planned = dispatch(initial);
  assert.equal(planned.status, 'dispatch-proposed');
  assert.equal(planned.effect, 'dispatch-once-after-durable-cas');
  assert.equal(planned.nextState?.receipts[candidate().intentId].status, 'dispatched');
  assert.equal(initial.revision, 0);
  assert.equal(initial.activeIntent, null);
  assert.equal(planned.retryAllowed, false);
});

test('atomic revision comparison admits only one of two concurrent proposals (test-only CAS)', async () => {
  let stored = state();
  const readRevision = stored.revision;
  const proposals = await Promise.all([
    Promise.resolve(dispatch(stored)),
    Promise.resolve(dispatch(stored)),
  ]);
  const committed = proposals.map((proposal) => {
    if (!proposal.nextState || stored.revision !== readRevision) return false;
    stored = proposal.nextState;
    return true;
  });
  assert.deepEqual(committed, [true, false]);
  assert.equal(dispatch(stored).effect, 'none');
});

test('different subjects/assessments also contend for one global writer slot', () => {
  const first = dispatch().nextState!;
  const ctx = context();
  ctx.assessment.subjectId = 'dsi';
  ctx.assessment.id = 'synthetic-assessment-b';
  assert.equal(dispatch(first, closeout(), ctx).status, 'busy');
});

test('same intent and changed payload, timestamp, evidence or PAS SHA is a conflict', () => {
  const first = dispatch().nextState!;
  const changed = closeout();
  changed.payload.nextBestActivity = 'Otra actividad sintética';
  assert.equal(dispatch(first, changed).status, 'conflict');
  changed.payload.nextBestActivity = null;
  changed.generatedAt = '2030-01-03T12:00:00Z';
  assert.equal(dispatch(first, changed).status, 'conflict');
  const evidence = closeout();
  evidence.basis.evidenceDigest = hash('1');
  assert.equal(dispatch(first, evidence).status, 'conflict');
  const ctx = context();
  ctx.assessment.pasMainSha = 'f'.repeat(40);
  assert.equal(dispatch(first, closeout(), ctx).status, 'conflict');
});

test('exact readback confirms once; replay never proposes another dispatch', () => {
  const pending = dispatch().nextState!;
  const done = recover(pending, completeRead([HEADER, candidate().row]));
  assert.equal(done.status, 'confirmed');
  assert.equal(done.nextState?.activeIntent, null);
  assert.equal(dispatch(done.nextState!).status, 'replay');
  assert.equal(dispatch(done.nextState!).effect, 'none');
});

test('lost response with an exact visible row can be confirmed by readback alone', () => {
  // There is deliberately no transport in the model. A crash leaves dispatched.
  const crashState = dispatch().nextState!;
  assert.equal(dispatch(crashState).status, 'uncertain');
  assert.equal(recover(crashState, completeRead([HEADER, candidate().row])).status, 'confirmed');
});

test('absence or failed/incomplete readback quarantines every subsequent intent', () => {
  for (const read of [
    completeRead(),
    { ...completeRead(), readComplete: false },
    { rows: null, readStatus: 'error', readComplete: false } as const,
  ]) {
    const pending = dispatch().nextState!;
    const uncertain = recover(pending, read);
    assert.equal(uncertain.status, 'uncertain');
    assert.equal(uncertain.nextState?.activeIntent, pending.activeIntent);
    assert.equal(dispatch(uncertain.nextState!).effect, 'none');
    const input = closeout();
    input.closeoutId = 'synthetic-session-2';
    const ctx = context();
    ctx.authorizedCloseoutId = input.closeoutId;
    assert.equal(dispatch(uncertain.nextState!, input, ctx).status, 'busy');
    assert.equal(
      recover(uncertain.nextState!, completeRead([HEADER, candidate().row])).status,
      'confirmed',
    );
  }
});

test('physical duplicates, timestamp mismatch and content conflict stay quarantined', () => {
  const row = candidate().row;
  const differentTime = [...row];
  differentTime[4] = '2030-01-03T12:00:00Z';
  const differentBody = [...row];
  differentBody[5] = JSON.stringify({ ...closeout().payload, name: 'Otra evaluación sintética' });
  for (const [rows, status] of [
    [[HEADER, row, row], 'duplicate'],
    [[HEADER, differentTime], 'conflict'],
    [[HEADER, differentBody], 'conflict'],
  ] as const) {
    const pending = dispatch().nextState!;
    const result = recover(pending, completeRead(rows));
    assert.equal(result.status, status);
    assert.equal(result.effect, 'none');
    assert.equal(recover(result.nextState!, completeRead([HEADER, row])).status, status);
  }
});

test('pre-existing identical current snapshot is recorded without sending or duplicating', () => {
  const oldRow = [...candidate().row];
  oldRow[4] = '2030-01-01T12:00:00Z';
  const planned = dispatch(state(), closeout(), context(), completeRead([HEADER, oldRow]));
  assert.equal(planned.status, 'already-visible');
  assert.equal(planned.effect, 'none');
  assert.equal(dispatch(planned.nextState!).status, 'replay');
});

test('material changes in a new session can advance after confirmation', () => {
  const done = recover(dispatch().nextState!, completeRead([HEADER, candidate().row])).nextState!;
  const input = closeout();
  input.closeoutId = 'synthetic-session-2';
  input.generatedAt = '2030-01-03T12:00:00Z';
  input.payload.nextBestActivity = 'Nueva actividad sintética';
  const ctx = context();
  ctx.authorizedCloseoutId = input.closeoutId;
  assert.equal(
    dispatch(done, input, ctx, completeRead([HEADER, candidate().row])).status,
    'dispatch-proposed',
  );
});

test('stale or tied closeouts cannot overwrite current preparation, even using stale Sheet input', () => {
  const done = recover(dispatch().nextState!, completeRead([HEADER, candidate().row])).nextState!;
  const input = closeout();
  input.closeoutId = 'synthetic-session-2';
  input.payload.nextBestActivity = 'Actividad anterior sintética';
  const ctx = context();
  ctx.authorizedCloseoutId = input.closeoutId;
  assert.equal(dispatch(done, input, ctx, completeRead()).status, 'stale');
  input.generatedAt = '2030-01-01T12:00:00Z';
  assert.equal(
    dispatch(state(), input, ctx, completeRead([HEADER, candidate().row])).status,
    'stale',
  );
});

test('returning to historical content does not falsely claim current display or reuse its ID', () => {
  const input = closeout();
  input.generatedAt = '2030-01-03T12:00:00Z';
  input.payload.nextBestActivity = 'Estado intermedio sintético';
  const middle = candidate(input).row;
  const returning = closeout();
  returning.generatedAt = '2030-01-04T12:00:00Z';
  assert.equal(
    dispatch(state(), returning, context(), completeRead([HEADER, candidate().row, middle])).status,
    'stale',
  );
});

test('loss of confirmed append-only history blocks the next session instead of recreating it', () => {
  const done = recover(dispatch().nextState!, completeRead([HEADER, candidate().row])).nextState!;
  const input = closeout();
  input.closeoutId = 'synthetic-session-2';
  input.generatedAt = '2030-01-03T12:00:00Z';
  input.payload.nextBestActivity = 'Actividad sintética nueva';
  const ctx = context();
  ctx.authorizedCloseoutId = input.closeoutId;
  assert.equal(dispatch(done, input, ctx, completeRead()).status, 'blocked');
});

test('different concurrent closeouts still require the same atomic aggregate CAS', () => {
  const original = state();
  const second = closeout();
  second.closeoutId = 'synthetic-session-2';
  second.generatedAt = '2030-01-03T12:00:00Z';
  const ctx = context();
  ctx.authorizedCloseoutId = second.closeoutId;
  const firstProposal = dispatch(original);
  const secondProposal = dispatch(original, second, ctx);
  assert.equal(firstProposal.nextState?.revision, secondProposal.nextState?.revision);
  // Once one revision commits, the other must be rejected by the real adapter.
  assert.equal(
    dispatch(firstProposal.nextState!, second, ctx, completeRead(), original.revision).status,
    'blocked',
  );
  assert.equal(dispatch(firstProposal.nextState!, second, ctx).status, 'busy');
});

test('a lost CAS acknowledgement cannot justify a second proposal or sending', () => {
  const proposal = dispatch();
  // Model a durable commit whose acknowledgement was lost. The caller has no
  // permission to use the proposed effect. Recovery sees the permanent slot.
  const stored = proposal.nextState!;
  assert.equal(dispatch(stored).effect, 'none');
  assert.equal(recover(stored, completeRead()).status, 'uncertain');
});

test('bad headers, invalid historical JSON, duplicates and incomplete pre-read block', () => {
  const invalid = [...candidate().row];
  invalid[0] = 'vida2:assessment-progress:v1:' + hash('f');
  invalid[5] = '{}';
  for (const read of [
    completeRead([['bad header']]),
    completeRead([HEADER, invalid]),
    { ...completeRead(), readComplete: false },
    completeRead([HEADER, candidate().row, candidate().row]),
  ]) {
    assert.equal(dispatch(state(), closeout(), context(), read).effect, 'none');
  }
});

test('writer stays shadow-only; no route, provider, store or environmental activation was added', () => {
  assert.equal(ASSESSMENT_CLOSEOUT_WRITER_MODE, 'SHADOW_READ_ONLY');
  for (const path of [
    'lib/assessment-progress/closeout-candidate.ts',
    'lib/assessment-progress/closeout-dispatch-model.ts',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(
      source,
      /fetch\(|process\.env|setTimeout\(|createUpstash|createFirestore|googleapis|\.\/runtime/,
    );
  }
});
