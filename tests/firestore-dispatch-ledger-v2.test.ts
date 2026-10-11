import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import {
  createPlanningV2FirestoreDispatchLedger,
  PLANNING_V2_FIRESTORE_ENABLED_NAME,
  PLANNING_V2_FIRESTORE_PROJECT_NAME,
  PLANNING_V2_FIRESTORE_SECRET_NAME,
  resolvePlanningV2FirestoreDevConfig,
  validPlanningV2FirestoreRecord,
} from '@/lib/daily-planning/firestore-dispatch-ledger-v2';
import type { PlanningV2LedgerRecord } from '@/lib/daily-planning/dispatch-ledger-v2';

// Generated ephemeral fixture key. No Google account, provider or real key is used.
const fixtureKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const PROJECT = 'planning-v2-isolated-dev-test';
const ACCOUNT = 'writer@' + PROJECT + '.iam.gserviceaccount.com';
const SECRET = JSON.stringify({
  type: 'service_account',
  project_id: PROJECT,
  client_email: ACCOUNT,
  private_key: fixtureKey,
  token_uri: 'https://oauth2.googleapis.com/token',
});
const config = { projectId: PROJECT, clientEmail: ACCOUNT, privateKey: fixtureKey };
const record = (suffix = 'a', digest = 'b'.repeat(64)): PlanningV2LedgerRecord => ({
  kind: 'execution',
  recordId: 'vida2:tasks-daily-planning:v2:execution:' + suffix.repeat(64),
  payloadDigest: digest,
});
const completeEnv = (): Record<string, string> => ({
  [PLANNING_V2_FIRESTORE_ENABLED_NAME]: 'true',
  [PLANNING_V2_FIRESTORE_PROJECT_NAME]: PROJECT,
  [PLANNING_V2_FIRESTORE_SECRET_NAME]: SECRET,
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'vida-qa',
  GOOGLE_SHEETS_TARGET: 'dev',
  DATA_SOURCE: 'google',
});

type Stored = {
  name: string;
  fields: {
    kind: { stringValue: string };
    digest: { stringValue: string };
    state: { stringValue: string };
  };
  updateTime: string;
};

function simulator(options: {
  tokenFailure?: boolean;
  createLostReply?: boolean;
  patchLostReply?: boolean;
  brokenGet?: boolean;
  forcePatchConflict?: boolean;
} = {}) {
  const docs = new Map<string, Stored>();
  const calls: string[] = [];
  let sequence = 0;
  let loseCreate = !!options.createLostReply;
  let losePatch = !!options.patchLostReply;
  const stamp = () => new Date(Date.UTC(2026, 9, 11, 0, 0, sequence++)).toISOString();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const error = (status: number) => json({ error: { code: status } }, status);
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    calls.push(method + ' ' + url.hostname);
    if (url.hostname === 'oauth2.googleapis.com') {
      assert.equal(method, 'POST');
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const jwt = body.get('assertion')?.split('.')[1] || '';
      const claims = JSON.parse(Buffer.from(jwt, 'base64url').toString()) as {
        iss: string; scope: string; aud: string;
      };
      assert.equal(claims.iss, ACCOUNT);
      assert.equal(claims.scope, 'https://www.googleapis.com/auth/datastore');
      assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
      return options.tokenFailure ? error(403) : json({ access_token: 'synthetic', expires_in: 3600 });
    }
    assert.equal(url.hostname, 'firestore.googleapis.com');
    assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, 'Bearer synthetic');
    assert.match(url.pathname, /\/projects\/planning-v2-isolated-dev-test\/databases\/\(default\)\/documents\/planning_v2_dispatch_v1/);
    const id = method === 'POST' ? url.searchParams.get('documentId')! : url.pathname.split('/').at(-1)!;
    assert.match(id, /^[a-f0-9]{64}$/);

    if (method === 'GET') {
      if (options.brokenGet) return new Response('not-json', { status: 200 });
      const doc = docs.get(id);
      return doc ? json(doc) : error(404);
    }
    if (method === 'POST') {
      if (docs.has(id)) return error(409);
      const payload = JSON.parse(String(init?.body)) as { fields: Stored['fields'] };
      const doc = {
        name: 'projects/' + PROJECT + '/databases/(default)/documents/planning_v2_dispatch_v1/' + id,
        fields: payload.fields,
        updateTime: stamp(),
      };
      docs.set(id, doc);
      if (loseCreate) {
        loseCreate = false;
        throw new Error('simulated lost create response after commit');
      }
      return json(doc);
    }
    assert.equal(method, 'PATCH');
    const before = docs.get(id);
    assert.equal(url.searchParams.get('updateMask.fieldPaths'), 'state');
    const expectedTime = url.searchParams.get('currentDocument.updateTime');
    // Cross-worker compare-and-swap. Delay lets two clients see the same prior version.
    await Promise.resolve();
    if (!before || docs.get(id)?.updateTime !== expectedTime || options.forcePatchConflict)
      return error(412);
    const body = JSON.parse(String(init?.body)) as { name: string; fields: { state: { stringValue: string } } };
    assert.equal(body.name, before.name);
    assert.equal(body.fields.state.stringValue, 'dispatched');
    const updated = {
      ...before,
      fields: { ...before.fields, state: { stringValue: 'dispatched' } },
      updateTime: stamp(),
    };
    docs.set(id, updated);
    if (losePatch) {
      losePatch = false;
      throw new Error('simulated lost patch response after commit');
    }
    return json(updated);
  };
  return { docs, calls, fetchImpl };
}

test('strict configuration is OFF by default and only accepts exact vida-qa Preview', () => {
  const good = completeEnv();
  assert.equal(resolvePlanningV2FirestoreDevConfig(good).ok, true);
  for (const [key, value] of [
    [PLANNING_V2_FIRESTORE_ENABLED_NAME, 'false'],
    [PLANNING_V2_FIRESTORE_ENABLED_NAME, 'TRUE'],
    ['VERCEL_ENV', 'production'],
    ['VERCEL_ENV', 'development'],
    ['VERCEL_GIT_COMMIT_REF', 'main'],
    ['VERCEL_GIT_COMMIT_REF', 'another-preview'],
    ['GOOGLE_SHEETS_TARGET', 'prod'],
    ['DATA_SOURCE', 'mock'],
  ]) {
    assert.equal(resolvePlanningV2FirestoreDevConfig({ ...good, [key]: value }).ok, false, key);
    const missing = { ...good };
    delete missing[key];
    assert.equal(resolvePlanningV2FirestoreDevConfig(missing).ok, false, key + ': missing');
  }
});

test('credential project, principal and token endpoint are strictly validated', () => {
  const good = completeEnv();
  const bad = [
    { [PLANNING_V2_FIRESTORE_SECRET_NAME]: 'not-json' },
    { [PLANNING_V2_FIRESTORE_PROJECT_NAME]: 'other-production-project' },
    { [PLANNING_V2_FIRESTORE_PROJECT_NAME]: '' },
    { [PLANNING_V2_FIRESTORE_SECRET_NAME]: JSON.stringify({ ...JSON.parse(SECRET), type: 'authorized_user' }) },
    { [PLANNING_V2_FIRESTORE_SECRET_NAME]: JSON.stringify({ ...JSON.parse(SECRET), client_email: 'writer@other.iam.gserviceaccount.com' }) },
    { [PLANNING_V2_FIRESTORE_SECRET_NAME]: JSON.stringify({ ...JSON.parse(SECRET), token_uri: 'https://evil.example/oauth' }) },
    { [PLANNING_V2_FIRESTORE_SECRET_NAME]: JSON.stringify({ ...JSON.parse(SECRET), private_key: 'not-a-key' }) },
  ];
  for (const values of bad) {
    assert.equal(resolvePlanningV2FirestoreDevConfig({ ...good, ...values }).ok, false);
  }
  assert.equal(resolvePlanningV2FirestoreDevConfig({
    ...good,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'old-production-account@example.com',
    GOOGLE_PRIVATE_KEY: 'legacy-sheets-secret',
    UPSTASH_REDIS_REST_TOKEN: 'legacy-redis-secret',
  }).ok, true, 'old credential presence does not feed Firestore');
});

test('validated record shapes reject stale, malformed and extra identity fields', () => {
  assert.equal(validPlanningV2FirestoreRecord(record()), true);
  assert.equal(validPlanningV2FirestoreRecord({ ...record(), payloadDigest: 'bad' }), false);
  assert.equal(validPlanningV2FirestoreRecord({ ...record(), recordId: 'other:abc' }), false);
  assert.equal(validPlanningV2FirestoreRecord({ ...record(), extra: 'untrusted' } as never), false);
});

test('prepare creates once and duplicate prepare is idempotent', async () => {
  const s = simulator();
  const ledger = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await ledger.transition('prepare', record()), 'prepared');
  assert.equal(await ledger.transition('prepare', record()), 'already-prepared');
  assert.equal(s.docs.size, 1);
  assert.equal(s.calls.filter(x => x.startsWith('POST firestore')).length, 1);
});

test('dispatch is forbidden before prepare', async () => {
  const s = simulator();
  const ledger = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await ledger.transition('dispatch', record()), 'blocked');
  assert.equal(s.docs.size, 0);
});

test('one concurrent dispatch wins CAS, never two', async () => {
  const s = simulator();
  const a = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  const b = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await a.transition('prepare', record()), 'prepared');
  const outcomes = await Promise.all([
    a.transition('dispatch', record()),
    b.transition('dispatch', record()),
  ]);
  assert.equal(outcomes.filter(x => x === 'dispatch-once').length, 1);
  assert.ok(outcomes.every(x => x === 'dispatch-once' || x === 'blocked' || x === 'uncertain'));
  assert.equal(s.docs.size, 1);
  assert.ok(s.calls.filter(x => x.startsWith('PATCH firestore')).length <= 2);
  assert.equal(await a.transition('dispatch', record()), 'uncertain');
});

test('a repeated dispatched ID remains quarantined across new adapter instances', async () => {
  const s = simulator();
  const first = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await first.transition('prepare', record()), 'prepared');
  assert.equal(await first.transition('dispatch', record()), 'dispatch-once');
  const restarted = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await restarted.transition('prepare', record()), 'uncertain');
  assert.equal(await restarted.transition('dispatch', record()), 'uncertain');
  assert.equal(s.calls.filter(x => x.startsWith('PATCH firestore')).length, 1);
});

test('a different digest for the same ID conflicts without replacing the record', async () => {
  const s = simulator();
  const ledger = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await ledger.transition('prepare', record()), 'prepared');
  assert.equal(await ledger.transition('dispatch', record('a', 'c'.repeat(64))), 'conflict');
  assert.equal(await ledger.transition('prepare', record('a', 'c'.repeat(64))), 'conflict');
  assert.equal(s.docs.size, 1);
  assert.equal(s.calls.filter(x => x.startsWith('PATCH firestore')).length, 0);
});

test('a lost create response does not authorize dispatch', async () => {
  const s = simulator({ createLostReply: true });
  const ledger = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await ledger.transition('prepare', record()), 'unavailable');
  assert.equal(s.docs.size, 1);
  assert.equal(s.calls.filter(x => x.startsWith('PATCH firestore')).length, 0);
});

test('a lost dispatch response is unavailable, but durable retry is uncertain', async () => {
  const s = simulator({ patchLostReply: true });
  const ledger = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await ledger.transition('prepare', record()), 'prepared');
  assert.equal(await ledger.transition('dispatch', record()), 'unavailable');
  const restarted = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await restarted.transition('dispatch', record()), 'uncertain');
  assert.equal(s.calls.filter(x => x.startsWith('PATCH firestore')).length, 1);
});

test('precondition failure, 412, never authorizes a second dispatch', async () => {
  const s = simulator({ forcePatchConflict: true });
  const ledger = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  assert.equal(await ledger.transition('prepare', record()), 'prepared');
  assert.equal(await ledger.transition('dispatch', record()), 'blocked');
  assert.equal(s.docs.size, 1);
});

test('invalid Firestore response and failed Google OAuth both fail closed', async () => {
  const s = simulator({ brokenGet: true });
  assert.equal(
    await createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl).transition('prepare', record()),
    'unavailable',
  );
  const bad = simulator({ tokenFailure: true });
  assert.equal(
    await createPlanningV2FirestoreDispatchLedger(config, bad.fetchImpl).transition('prepare', record()),
    'unavailable',
  );
  assert.equal(bad.calls.some(x => x.includes('firestore')), false);
});

test('all network interactions are OAuth or Firestore only; never Sheets or Upstash', async () => {
  const s = simulator();
  const ledger = createPlanningV2FirestoreDispatchLedger(config, s.fetchImpl);
  await ledger.transition('prepare', record());
  await ledger.transition('dispatch', record());
  assert.ok(s.calls.every(x => /oauth2.googleapis.com|firestore.googleapis.com/.test(x)));
  const actual = createHash('sha256').update(record().kind + ':' + record().recordId).digest('hex');
  assert.ok(s.docs.has(actual));
});

/* PRETTIER_DIAGNOSTIC_BEGIN */
test('internal formatting snapshot for draft CI (temporary)', async () => {
  const fs = await import('node:fs/promises');
  const prettier = await import('prettier');
  const paths = [
    'lib/daily-planning/firestore-dispatch-ledger-v2.ts',
    'tests/firestore-dispatch-ledger-v2.test.ts',
  ];
  for (const [index, path] of paths.entries()) {
    const original = await fs.readFile(path, 'utf8');
    const clean = index === 1 ? original.split('/* PRETTIER_DIAGNOSTIC_BEGIN */')[0] : original;
    const config = (await prettier.resolveConfig(path)) || {};
    const formatted = await prettier.format(clean, { ...config, filepath: path });
    const base64 = Buffer.from(formatted).toString('base64');
    const chunks = Math.ceil(base64.length / 1200);
    console.log('PASFORMAT_BEGIN|' + index + '|' + chunks);
    for (let i = 0; i < chunks; i++) {
      console.log('PASFORMAT_CHUNK|' + index + '|' + i + '|' + base64.slice(i * 1200, (i + 1) * 1200));
    }
    console.log('PASFORMAT_END|' + index + '|' + chunks);
  }
});
