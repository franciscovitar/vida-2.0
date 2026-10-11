import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  issueSyntheticPlanningV2WriteIntent,
  simulateIntentGatedPlanningV2Write,
  verifySyntheticPlanningV2WriteIntent,
} from '@/lib/daily-planning/write-intent-v2';

const SECRET = 'isolated-development-fixture-key-not-real-credentials';
const OTHER_SECRET = 'independent-isolated-test-fixture-key-of-equal-length';
const DAY = '2026-10-11';
const ROW: unknown[] = [
  'vida2:tasks-daily-planning:v2:execution:' +
    '5f3a8424a73a20ff8ed51f69aa00a29b935c6d65752763a767a2f97e9cc2458d',
  DAY,
  '2026-10-11T09:30:00-03:00',
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
const CONTEXT = {
  actorId: 'fake-authenticated-actor',
  devWorkbookId: 'fake-disposable-dev-workbook',
  executionRow: ROW,
  nowSeconds: 1000000,
};

function fakePorts() {
  let state: 'new' | 'prepared' | 'dispatched' = 'new';
  let requests = 0;
  let inspected = 0;
  const ports = {
    async transition(operation: 'prepare' | 'dispatch') {
      requests++;
      if (operation === 'prepare' && state === 'new') {
        state = 'prepared';
        return 'prepared' as const;
      }
      if (operation === 'prepare' && state === 'prepared') return 'already-prepared' as const;
      if (operation === 'dispatch' && state === 'prepared') {
        state = 'dispatched';
        return 'dispatch-once' as const;
      }
      return 'uncertain' as const;
    },
    async inspect() {
      inspected++;
      return {
        status:
          state === 'dispatched' ? ('confirmed' as const) : ('not-observed-uncertain' as const),
        matchedRows: state === 'dispatched' ? 1 : 0,
        retryAllowed: false as const,
      };
    },
    async sendOnce() {
      requests++;
    },
  };
  return {
    ports,
    get requests() {
      return requests;
    },
    get inspected() {
      return inspected;
    },
  };
}
test('valid fresh synthetic MAC verifies for exact row, actor, workbook and time', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET);
  assert.ok(intent);
  assert.equal(verifySyntheticPlanningV2WriteIntent(intent, CONTEXT, SECRET), true);
});
test('issuer refuses structurally valid but FORGED canonical row fingerprint', () => {
  const forged = [...ROW];
  forged[0] = 'vida2:tasks-daily-planning:v2:execution:' + 'f'.repeat(64);
  assert.equal(
    issueSyntheticPlanningV2WriteIntent({ ...CONTEXT, executionRow: forged }, SECRET),
    null,
  );
});
test('issuer refuses absent or weak signer secret', () => {
  assert.equal(issueSyntheticPlanningV2WriteIntent(CONTEXT, ''), null);
  assert.equal(issueSyntheticPlanningV2WriteIntent(CONTEXT, 'short'), null);
});
test('issuer refuses corrupt actor, workbook or candidate row', () => {
  assert.equal(issueSyntheticPlanningV2WriteIntent({ ...CONTEXT, actorId: '' }, SECRET), null);
  assert.equal(
    issueSyntheticPlanningV2WriteIntent({ ...CONTEXT, devWorkbookId: 'x' }, SECRET),
    null,
  );
  assert.equal(issueSyntheticPlanningV2WriteIntent({ ...CONTEXT, executionRow: [] }, SECRET), null);
});
test('MAC tamper, partial signature and foreign signer key fail', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  assert.equal(verifySyntheticPlanningV2WriteIntent(intent, CONTEXT, OTHER_SECRET), false);
  assert.equal(
    verifySyntheticPlanningV2WriteIntent({ ...intent, mac: '0'.repeat(64) }, CONTEXT, SECRET),
    false,
  );
  assert.equal(
    verifySyntheticPlanningV2WriteIntent({ ...intent, mac: 'bad' }, CONTEXT, SECRET),
    false,
  );
});
test('later or replayed row with same ID and different contents fails', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  const changed = [...ROW];
  changed[7] = 'Other activity';
  assert.equal(
    verifySyntheticPlanningV2WriteIntent(intent, { ...CONTEXT, executionRow: changed }, SECRET),
    false,
  );
  const later = [...ROW];
  later[2] = '2026-10-11T17:00:00Z';
  assert.equal(
    verifySyntheticPlanningV2WriteIntent(intent, { ...CONTEXT, executionRow: later }, SECRET),
    false,
  );
});
test('valid MAC is scoped to one actor and one DEV workbook', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  assert.equal(
    verifySyntheticPlanningV2WriteIntent(intent, { ...CONTEXT, actorId: 'different-user' }, SECRET),
    false,
  );
  assert.equal(
    verifySyntheticPlanningV2WriteIntent(
      intent,
      { ...CONTEXT, devWorkbookId: 'another-disposable-dev-workbook' },
      SECRET,
    ),
    false,
  );
});
test('intent expires after five minutes and cannot be used early', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  assert.equal(
    verifySyntheticPlanningV2WriteIntent(
      intent,
      { ...CONTEXT, nowSeconds: CONTEXT.nowSeconds + 299 },
      SECRET,
    ),
    true,
  );
  assert.equal(
    verifySyntheticPlanningV2WriteIntent(
      intent,
      { ...CONTEXT, nowSeconds: CONTEXT.nowSeconds + 300 },
      SECRET,
    ),
    false,
  );
  assert.equal(
    verifySyntheticPlanningV2WriteIntent(
      intent,
      { ...CONTEXT, nowSeconds: CONTEXT.nowSeconds - 1 },
      SECRET,
    ),
    false,
  );
});
test('purpose-swapped payload is rejected even when signed by same key', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  const payload = JSON.parse(Buffer.from(intent.payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  payload.purpose = 'planning-v2:orientation:write-intent';
  const serialized = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', SECRET).update(serialized, 'utf8').digest('hex');
  assert.equal(
    verifySyntheticPlanningV2WriteIntent({ payload: serialized, mac }, CONTEXT, SECRET),
    false,
  );
});
test('unexpected, extra or reordered signed claim fields fail closed', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  const claims = JSON.parse(Buffer.from(intent.payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  for (const altered of [
    { ...claims, extra: 'untrusted' },
    Object.fromEntries(Object.entries(claims).reverse()),
  ]) {
    const serialized = Buffer.from(JSON.stringify(altered), 'utf8').toString('base64url');
    const mac = createHmac('sha256', SECRET).update(serialized, 'utf8').digest('hex');
    const expected = Object.hasOwn(altered, 'extra') ? false : true;
    assert.equal(
      verifySyntheticPlanningV2WriteIntent({ payload: serialized, mac }, CONTEXT, SECRET),
      expected,
    );
  }
});
test('bad intent cannot touch pre-read, durable ledger or send port', async () => {
  const fake = fakePorts();
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  const res = await simulateIntentGatedPlanningV2Write(
    {
      context: { ...CONTEXT, actorId: 'not-the-same-actor' },
      intent,
    },
    SECRET,
    fake.ports,
  );
  assert.deepEqual(res, { status: 'blocked', sendAttempts: 0, retryAllowed: false });
  assert.equal(fake.requests, 0);
  assert.equal(fake.inspected, 0);
});
test('valid synthetic intent proceeds through existing simulated protocol', async () => {
  const fake = fakePorts();
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  const result = await simulateIntentGatedPlanningV2Write(
    { context: CONTEXT, intent },
    SECRET,
    fake.ports,
  );
  assert.deepEqual(result, { status: 'confirmed', sendAttempts: 1, retryAllowed: false });
  assert.equal(fake.requests, 3);
  assert.equal(fake.inspected, 2);
});
test('two attempts with one valid intent still authorize at most one send', async () => {
  const fake = fakePorts();
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  const first = await simulateIntentGatedPlanningV2Write(
    { context: CONTEXT, intent },
    SECRET,
    fake.ports,
  );
  const second = await simulateIntentGatedPlanningV2Write(
    { context: CONTEXT, intent },
    SECRET,
    fake.ports,
  );
  assert.equal(first.status, 'confirmed');
  assert.equal(second.status, 'already-visible');
  assert.equal(fake.requests, 3);
});
test('opaque MAC envelope never includes raw workbook, actor or description', () => {
  const intent = issueSyntheticPlanningV2WriteIntent(CONTEXT, SECRET)!;
  const encoded = JSON.stringify(intent);
  for (const value of [CONTEXT.actorId, CONTEXT.devWorkbookId, 'Práctica inventarios', SECRET]) {
    assert.equal(encoded.includes(value), false);
  }
});
