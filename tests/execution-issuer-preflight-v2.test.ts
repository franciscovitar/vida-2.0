import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  preflightPlanningV2ExecutionIssuer,
  type PlanningV2IssuerPreflightPorts,
} from '@/lib/daily-planning/execution-issuer-preflight-v2';

const ROW: unknown[] = [
  'vida2:tasks-daily-planning:v2:execution:' +
    '5f3a8424a73a20ff8ed51f69aa00a29b935c6d65752763a767a2f97e9cc2458d',
  '2026-10-11',
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
const REPORT_ID = 'a'.repeat(64);
const env = (): Record<string, string> => ({
  PLANNING_V2_DEV_ISSUER_PREFLIGHT_ENABLED: 'true',
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'vida-qa',
  DATA_SOURCE: 'google',
  GOOGLE_SHEETS_TARGET: 'dev',
  GOOGLE_SHEETS_DEV_ID: 'synthetic-dev-workbook-id',
  GOOGLE_SHEETS_PROD_ID: 'distinct-production-workbook',
  AUTH_SECRET: 'synthetic-test-auth-secret',
  AUTH_GOOGLE_ID: 'fake-google-client-id',
  AUTH_GOOGLE_SECRET: 'fake-google-client-secret',
  AUTH_ALLOWED_EMAILS: 'owner@example.test',
});

function fixture(overrides: {
  row?: readonly unknown[];
  actorId?: string;
  source?: string;
  consent?: boolean;
  email?: string | null;
} = {}) {
  const calls = { session: 0, source: 0, consent: 0 };
  let binding: {
    actorId: string;
    reportId: string;
    observationId: string;
    rowDigest: string;
    devWorkbookId: string;
  } | null = null;
  const ports: PlanningV2IssuerPreflightPorts = {
    async getSession() {
      calls.session++;
      return { user: { id: 'actor-owner', email: overrides.email ?? 'owner@example.test' } };
    },
    async loadTrustedReport(actorId) {
      calls.source++;
      assert.equal(actorId, 'actor-owner');
      return {
        source: overrides.source ?? 'authenticated-user-checkin',
        actorId: overrides.actorId ?? actorId,
        reportId: REPORT_ID,
        executionRow: overrides.row ?? ROW,
      } as Awaited<ReturnType<PlanningV2IssuerPreflightPorts['loadTrustedReport']>>;
    },
    async confirmOptIn(input) {
      calls.consent++;
      binding = input;
      return overrides.consent ?? true;
    },
  };
  return {
    ports,
    calls,
    get binding() {
      return binding;
    },
  };
}

test('authenticated check-in and exact consent can pass isolated OFFLINE preflight', async () => {
  const f = fixture();
  const result = await preflightPlanningV2ExecutionIssuer(env(), f.ports);
  assert.equal(result.status, 'ready-offline');
  if (result.status !== 'ready-offline') return;
  assert.equal(result.actorId, 'actor-owner');
  assert.equal(result.devWorkbookId, 'synthetic-dev-workbook-id');
  assert.equal(result.executionRow[0], ROW[0]);
  assert.match(result.rowDigest, /^[a-f0-9]{64}$/);
  assert.equal(f.binding?.reportId, REPORT_ID);
  assert.equal(f.binding?.observationId, ROW[0]);
  assert.equal(f.binding?.rowDigest, result.rowDigest);
  assert.deepEqual(f.calls, { session: 1, source: 1, consent: 1 });
});

test('issuer stays OFF unless independently enabled', async () => {
  const f = fixture();
  const x = env();
  delete x.PLANNING_V2_DEV_ISSUER_PREFLIGHT_ENABLED;
  assert.deepEqual(await preflightPlanningV2ExecutionIssuer(x, f.ports), { status: 'blocked' });
  assert.deepEqual(f.calls, { session: 0, source: 0, consent: 0 });
});

test('Production, other Preview branches and wrong workbook never inspect the report', async () => {
  for (const [key, value] of [
    ['VERCEL_ENV', 'production'],
    ['VERCEL_GIT_COMMIT_REF', 'main'],
    ['GOOGLE_SHEETS_TARGET', 'prod'],
    ['DATA_SOURCE', 'mock'],
    ['GOOGLE_SHEETS_PROD_ID', 'synthetic-dev-workbook-id'],
  ]) {
    const f = fixture();
    assert.equal(
      (await preflightPlanningV2ExecutionIssuer({ ...env(), [key]: value }, f.ports)).status,
      'blocked',
      key,
    );
    assert.equal(f.calls.session, 0);
  }
});

test('missing required account or workbook configuration fails before provenance', async () => {
  for (const key of [
    'AUTH_SECRET',
    'AUTH_ALLOWED_EMAILS',
    'GOOGLE_SHEETS_DEV_ID',
    'GOOGLE_SHEETS_PROD_ID',
  ]) {
    const f = fixture();
    const x = env();
    delete x[key];
    assert.equal((await preflightPlanningV2ExecutionIssuer(x, f.ports)).status, 'blocked');
    assert.equal(f.calls.source, 0);
  }
});

test('unauthorized or absent verified session cannot load any private report', async () => {
  const f = fixture({ email: 'attacker@example.test' });
  assert.equal((await preflightPlanningV2ExecutionIssuer(env(), f.ports)).status, 'blocked');
  assert.equal(f.calls.source, 0);
  const z = fixture();
  z.ports.getSession = async () => null;
  assert.equal((await preflightPlanningV2ExecutionIssuer(env(), z.ports)).status, 'blocked');
  assert.equal(z.calls.source, 0);
});

test('report must belong to authenticated actor and originate from a trusted check-in', async () => {
  for (const overrides of [
    { actorId: 'other-user' },
    { source: 'journal-raw' },
    { source: 'browser-asserted' },
  ]) {
    const f = fixture(overrides);
    assert.equal((await preflightPlanningV2ExecutionIssuer(env(), f.ports)).status, 'blocked');
    assert.equal(f.calls.consent, 0);
  }
});

test('forged row identity and raw Journal source class fail before consent', async () => {
  const altered = [...ROW];
  altered[0] = 'vida2:tasks-daily-planning:v2:execution:' + 'f'.repeat(64);
  const f = fixture({ row: altered });
  assert.equal((await preflightPlanningV2ExecutionIssuer(env(), f.ports)).status, 'blocked');
  assert.equal(f.calls.consent, 0);
  const journal = [...ROW];
  journal[13] = 'journal_observation';
  const j = fixture({ row: journal });
  assert.equal((await preflightPlanningV2ExecutionIssuer(env(), j.ports)).status, 'blocked');
  assert.equal(j.calls.consent, 0);
});

test('consent denied or unavailable always blocks even with a valid report', async () => {
  const denied = fixture({ consent: false });
  assert.equal((await preflightPlanningV2ExecutionIssuer(env(), denied.ports)).status, 'blocked');
  assert.equal(denied.calls.consent, 1);
  const lost = fixture();
  lost.ports.confirmOptIn = async () => {
    throw new Error('source unavailable');
  };
  assert.equal((await preflightPlanningV2ExecutionIssuer(env(), lost.ports)).status, 'blocked');
});

test('failed authoritative source never becomes an inferred check-in', async () => {
  const f = fixture();
  f.ports.loadTrustedReport = async () => {
    throw new Error('unavailable');
  };
  assert.equal((await preflightPlanningV2ExecutionIssuer(env(), f.ports)).status, 'blocked');
  assert.equal(f.calls.consent, 0);
});

test('legacy Sheets keys, Redis tokens and Firestore key presence do not bypass issuer gates', async () => {
  const f = fixture({ consent: false });
  const supplied = {
    ...env(),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'legacy@example.test',
    GOOGLE_PRIVATE_KEY: 'legacy',
    UPSTASH_REDIS_REST_TOKEN: 'legacy',
    PLANNING_V2_DEV_FIRESTORE_SERVICE_ACCOUNT_JSON: '{"private_key":"not-for-tests"}',
  };
  assert.equal((await preflightPlanningV2ExecutionIssuer(supplied, f.ports)).status, 'blocked');
  assert.equal(f.calls.consent, 1);
});

/* PAS_V2_FORMAT_CAPTURE_BEGIN */
test('temporary offline format capture for CI; remove before final commit', async () => {
  const fs = await import('node:fs/promises');
  const prettier = await import('prettier');
  const target = 'tests/execution-issuer-preflight-v2.test.ts';
  const raw = await fs.readFile(target, 'utf8');
  const original = raw.split('/* PAS_V2_FORMAT_CAPTURE_BEGIN */')[0];
  const options = (await prettier.resolveConfig(target)) || {};
  const formatted = await prettier.format(original, { ...options, filepath: target });
  const b64 = Buffer.from(formatted, 'utf8').toString('base64');
  const count = Math.ceil(b64.length / 1200);
  console.log('PASFMT_START|' + count);
  for (let i = 0; i < count; i++)
    console.log('PASFMT_PART|' + i + '|' + b64.slice(i * 1200, (i + 1) * 1200));
  console.log('PASFMT_FINISH|' + count);
});
