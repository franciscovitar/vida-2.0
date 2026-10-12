import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  checkPlanningV2ExecutionAcceptance,
  PLANNING_V2_ACCEPTANCE_OPERATION,
  type PlanningV2AcceptanceEvidence,
  type PlanningV2AcceptanceRequest,
} from '@/lib/daily-planning/execution-acceptance-contract-v2';
import {
  proposePlanningV2ReportedExecution,
  type PlanningV2ReportedActivity,
} from '@/lib/daily-planning/reported-execution-candidate-v2';

const key = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture(
  report: Partial<PlanningV2ReportedActivity> = {},
  route: 'chatgpt' | 'authjs' = 'chatgpt',
  event = 'synthetic-event-one',
  acceptance = 'synthetic-acceptance-one',
) {
  const candidate = proposePlanningV2ReportedExecution({
    day: '2099-01-01',
    recordedAt: '2099-01-01T12:00:00Z',
    activityType: 'study',
    domain: 'university',
    entityType: 'subject',
    canonicalRef: 'synthetic-subject',
    activity: 'Synthetic practice',
    declaredMinutes: 30,
    actualStart: null,
    executionState: 'partial',
    ...report,
  });
  assert.equal(candidate.status, 'candidate-only');
  if (candidate.status !== 'candidate-only') throw new Error('invalid synthetic fixture');
  const request: PlanningV2AcceptanceRequest = {
    operation: PLANNING_V2_ACCEPTANCE_OPERATION,
    executionRow: candidate.row,
    devWorkbookKey: key('synthetic-dev'),
    intent: 'observation',
    priorObservationId: null,
  };
  const principal: PlanningV2AcceptanceEvidence['principal'] = {
    kind: route === 'chatgpt' ? 'integration-principal' : 'authjs-session',
    authorityKey: key('synthetic-authority'),
    subjectKey: key('synthetic-provider-subject'),
    actorKey: key('synthetic-mapped-actor'),
  };
  const origin: PlanningV2AcceptanceEvidence['origin'] = {
    kind:
      route === 'chatgpt' ? 'chatgpt-authenticated-invocation' : 'vida-authenticated-acceptance',
    eventKey: route === 'chatgpt' && event ? key(event) : null,
    acceptanceKey: key(acceptance),
  };
  const receipt = {
    actorKey: principal.actorKey,
    operation: PLANNING_V2_ACCEPTANCE_OPERATION,
    observationId: candidate.row[0] as string,
    rowDigest: key(JSON.stringify(['execution', candidate.row])),
    devWorkbookKey: request.devWorkbookKey,
    repetitionKey: key(
      JSON.stringify([
        PLANNING_V2_ACCEPTANCE_OPERATION,
        principal.authorityKey,
        principal.subjectKey,
        principal.actorKey,
        request.devWorkbookKey,
        origin.kind,
        origin.eventKey,
        origin.acceptanceKey,
      ]),
    ),
  };
  const evidence: PlanningV2AcceptanceEvidence = {
    principal,
    origin,
    target: {
      kind: 'dev',
      workbookKey: request.devWorkbookKey,
      productionWorkbookKey: key('synthetic-prod'),
    },
    receipt,
    consent: {
      mode: route === 'chatgpt' ? 'standing-opt-in' : 'explicit-acceptance',
      decision: 'allow',
      policyKey: key('synthetic-policy-revision'),
      binding: { ...receipt },
    },
    history: { status: 'complete', query: { ...receipt }, entries: [] },
  };
  return { request, evidence };
}

test('ChatGPT-first bindings are only consistent offline, never a write authorization', () => {
  const f = fixture();
  const result = checkPlanningV2ExecutionAcceptance(f.request, f.evidence);
  assert.deepEqual(result, {
    status: 'consistent-offline',
    reason: 'consistent-bindings',
    writeAuthorized: false,
  });
  assert.deepEqual(Object.keys(result), ['status', 'reason', 'writeAuthorized']);
  // Even entirely fabricated but coherent fixture data cannot issue authority.
  assert.equal(
    checkPlanningV2ExecutionAcceptance(f.request, structuredClone(f.evidence)).writeAuthorized,
    false,
  );
});

test('missing evidence and client consent/authentication assertions fail closed', () => {
  const f = fixture();
  for (const evidence of [null, {}, true, { ...f.evidence, consent: true }]) {
    assert.equal(checkPlanningV2ExecutionAcceptance(f.request, evidence).status, 'blocked');
  }
  for (const extras of [
    { actorKey: key('impersonated') },
    { consent: true },
    { authenticated: true },
    { journalRaw: 'private' },
  ]) {
    assert.equal(
      checkPlanningV2ExecutionAcceptance({ ...f.request, ...extras }, f.evidence).reason,
      'invalid-contract',
    );
  }
});

test('changing the actor mapping or provider subject cannot reuse a receipt', () => {
  for (const field of ['actorKey', 'subjectKey', 'authorityKey'] as const) {
    const f = fixture();
    f.evidence.principal[field] = key('impersonated');
    assert.equal(
      checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason,
      'binding-mismatch',
    );
  }
});

test('denied, unavailable and differently scoped consent cannot authorize the candidate', () => {
  for (const decision of ['deny', 'unavailable'] as const) {
    const f = fixture();
    f.evidence.consent.decision = decision;
    assert.equal(
      checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason,
      'consent-not-applicable',
    );
  }
  for (const field of ['actorKey', 'rowDigest', 'devWorkbookKey', 'repetitionKey'] as const) {
    const f = fixture();
    f.evidence.consent.binding[field] = key('foreign-scope');
    assert.equal(
      checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason,
      'consent-not-applicable',
    );
  }
});

test('candidate digest is recomputed; tampered digest or normalized content blocks', () => {
  const f = fixture();
  f.evidence.receipt.rowDigest = key('forged-digest');
  assert.equal(
    checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason,
    'binding-mismatch',
  );
  const original = fixture();
  const changed = fixture({ declaredMinutes: 31 });
  assert.equal(
    checkPlanningV2ExecutionAcceptance(changed.request, original.evidence).reason,
    'binding-mismatch',
  );
});

test('destination swaps and DEV/Production aliasing fail; non-DEV operations are not accepted', () => {
  const f = fixture();
  assert.equal(
    checkPlanningV2ExecutionAcceptance(
      { ...f.request, devWorkbookKey: key('other-dev') },
      f.evidence,
    ).reason,
    'target-mismatch',
  );
  f.evidence.target.productionWorkbookKey = f.request.devWorkbookKey;
  assert.equal(checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason, 'target-mismatch');
  assert.equal(
    checkPlanningV2ExecutionAcceptance({ ...f.request, operation: 'production-append' }, f.evidence)
      .reason,
    'invalid-contract',
  );
});

test('Auth.js DEV acceptance is supported separately and never retroactively proves ChatGPT origin', () => {
  const f = fixture({}, 'authjs');
  assert.equal(
    checkPlanningV2ExecutionAcceptance(f.request, f.evidence).status,
    'consistent-offline',
  );
  f.evidence.origin.eventKey = key('claimed-chat-turn');
  assert.equal(checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason, 'origin-mismatch');
  const standing = fixture({}, 'authjs');
  standing.evidence.consent.mode = 'standing-opt-in';
  assert.equal(
    checkPlanningV2ExecutionAcceptance(standing.request, standing.evidence).reason,
    'origin-mismatch',
  );
  const disguised = fixture();
  disguised.evidence.principal.kind = 'authjs-session';
  assert.equal(
    checkPlanningV2ExecutionAcceptance(disguised.request, disguised.evidence).reason,
    'origin-mismatch',
  );
});

test('original event identity can be absent, but a stable executor receipt cannot be invented or omitted', () => {
  const f = fixture({}, 'chatgpt', '');
  assert.equal(f.evidence.origin.eventKey, null);
  assert.equal(
    checkPlanningV2ExecutionAcceptance(f.request, f.evidence).status,
    'consistent-offline',
  );
  f.evidence.origin.acceptanceKey = '';
  assert.equal(
    checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason,
    'authority-evidence-missing',
  );
});

test('replay needs the same accepted event, actor, destination and exact frozen row', () => {
  const f = fixture();
  f.evidence.history.entries = [{ ...f.evidence.receipt }];
  assert.deepEqual(checkPlanningV2ExecutionAcceptance(f.request, f.evidence), {
    status: 'replay-offline',
    reason: 'same-accepted-execution',
    writeAuthorized: false,
  });
  const changed = fixture({ recordedAt: '2099-01-01T12:01:00Z' });
  assert.equal(changed.request.executionRow[0], f.request.executionRow[0]);
  changed.evidence.history.entries = [{ ...f.evidence.receipt }];
  assert.equal(
    checkPlanningV2ExecutionAcceptance(changed.request, changed.evidence).reason,
    'event-content-conflict',
  );
});

test('the same source execution cannot silently change observation identity', () => {
  const old = fixture();
  const changed = fixture({ declaredMinutes: 31 });
  assert.notEqual(changed.request.executionRow[0], old.request.executionRow[0]);
  changed.evidence.history.entries = [old.evidence.receipt];
  assert.equal(
    checkPlanningV2ExecutionAcceptance(changed.request, changed.evidence).reason,
    'event-content-conflict',
  );
});

test('two legitimate identical activities on the same day are an identity ambiguity, not a replay', () => {
  const first = fixture();
  const second = fixture({}, 'chatgpt', 'synthetic-event-two', 'synthetic-acceptance-two');
  assert.equal(second.request.executionRow[0], first.request.executionRow[0]);
  assert.notEqual(second.evidence.receipt.repetitionKey, first.evidence.receipt.repetitionKey);
  second.evidence.history.entries = [first.evidence.receipt];
  assert.equal(
    checkPlanningV2ExecutionAcceptance(second.request, second.evidence).reason,
    'observation-ambiguous',
  );
});

test('a reported distinct start disambiguates existing canonical IDs without changing their algorithm', () => {
  const first = fixture();
  const second = fixture(
    { actualStart: '11:00' },
    'chatgpt',
    'synthetic-event-two',
    'synthetic-acceptance-two',
  );
  assert.notEqual(second.request.executionRow[0], first.request.executionRow[0]);
  assert.equal(
    checkPlanningV2ExecutionAcceptance(second.request, second.evidence).status,
    'consistent-offline',
  );
});

test('multiple intents in one source event keep separate stable acceptance receipts', () => {
  const first = fixture();
  const second = fixture(
    { actualStart: '11:00' },
    'chatgpt',
    'synthetic-event-one',
    'synthetic-acceptance-two',
  );
  assert.equal(first.evidence.origin.eventKey, second.evidence.origin.eventKey);
  assert.notEqual(first.evidence.receipt.repetitionKey, second.evidence.receipt.repetitionKey);
  assert.equal(
    checkPlanningV2ExecutionAcceptance(second.request, second.evidence).status,
    'consistent-offline',
  );
});

test('without a host event key only the original stable receipt can be classified as replay', () => {
  const first = fixture({}, 'chatgpt', '');
  first.evidence.history.entries = [first.evidence.receipt];
  assert.equal(
    checkPlanningV2ExecutionAcceptance(first.request, first.evidence).status,
    'replay-offline',
  );
  const regenerated = fixture({}, 'chatgpt', '', 'different-receipt');
  regenerated.evidence.history.entries = [first.evidence.receipt];
  assert.equal(
    checkPlanningV2ExecutionAcceptance(regenerated.request, regenerated.evidence).reason,
    'observation-ambiguous',
  );
});

test('missing, stale, unrelated or duplicated association history is not proof of a new event', () => {
  const f = fixture();
  f.evidence.history.status = 'unavailable';
  assert.equal(
    checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason,
    'history-unavailable',
  );
  const stale = fixture();
  stale.evidence.history.query.rowDigest = key('stale-query');
  assert.equal(
    checkPlanningV2ExecutionAcceptance(stale.request, stale.evidence).reason,
    'history-unavailable',
  );
  const unrelated = fixture();
  unrelated.evidence.history.entries = [
    fixture({ declaredMinutes: 31 }, 'chatgpt', 'unrelated', 'unrelated').evidence.receipt,
  ];
  assert.equal(
    checkPlanningV2ExecutionAcceptance(unrelated.request, unrelated.evidence).reason,
    'history-unavailable',
  );
  const duplicate = fixture();
  duplicate.evidence.history.entries = [duplicate.evidence.receipt, duplicate.evidence.receipt];
  assert.equal(
    checkPlanningV2ExecutionAcceptance(duplicate.request, duplicate.evidence).reason,
    'observation-ambiguous',
  );
});

test('correction lineage is explicitly blocked rather than overwritten or appended as a new activity', () => {
  const first = fixture();
  const correction = fixture(
    { declaredMinutes: 31 },
    'chatgpt',
    'correction-event',
    'correction-receipt',
  );
  const request = {
    ...correction.request,
    intent: 'correction',
    priorObservationId: first.request.executionRow[0],
  };
  assert.equal(
    checkPlanningV2ExecutionAcceptance(request, correction.evidence).reason,
    'correction-not-supported',
  );
  assert.equal(
    checkPlanningV2ExecutionAcceptance({ ...request, intent: 'observation' }, correction.evidence)
      .reason,
    'correction-not-supported',
  );
});

test('forged canonical identity, stronger evidence, oversized history and malformed snapshots fail closed', () => {
  for (const [index, value] of [
    [0, 'vida2:tasks-daily-planning:v2:execution:' + key('forged')],
    [11, 'VERIFIED'],
    [15, '["unapproved-lineage"]'],
  ] as const) {
    const f = fixture();
    const row = [...f.request.executionRow];
    row[index] = value;
    assert.equal(
      checkPlanningV2ExecutionAcceptance({ ...f.request, executionRow: row }, f.evidence).reason,
      'invalid-contract',
    );
  }
  const f = fixture();
  f.evidence.history.entries = Array.from({ length: 65 }, () => f.evidence.receipt);
  assert.equal(
    checkPlanningV2ExecutionAcceptance(f.request, f.evidence).reason,
    'authority-evidence-missing',
  );
  assert.equal(checkPlanningV2ExecutionAcceptance(null, null).reason, 'invalid-contract');
});
