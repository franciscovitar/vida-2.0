/**
 * Block 3 — OpenClaw proposal-only (flags off por defecto; memoria en tests).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { isOpenClawProposalsEnabled } from '@/lib/actions/config';
import { createMemoryAuditSink } from '@/lib/actions/audit';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import { createMemoryProposalPort } from '@/lib/actions/memory-ports';
import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';
import { buildCanonicalString, signCanonical } from '@/lib/openclaw/auth';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import {
  createOpenClawProposal,
  getOpenClawProposal,
  isOpenClawProposeOperation,
  parseOpenClawProposalRequest,
  toOpenClawProposalMetadata,
} from '@/lib/openclaw/proposals';
import { POST as postProposals } from '@/app/api/openclaw/v1/proposals/route';
import { GET as getProposal } from '@/app/api/openclaw/v1/proposals/[key]/route';
import { GET as getHealth } from '@/app/api/openclaw/v1/health/route';
import { GET as getCapabilities } from '@/app/api/openclaw/v1/capabilities/route';

const KEY_ID = 'oc_prop_key';
const SECRET = 'oc_prop_secret_value_32chars_min!!';

const WRITE_MEMORY_ENV = {
  NODE_ENV: 'test',
  WRITE_ACTIONS_ENABLED: 'true',
  WRITE_ACTIONS_USE_MEMORY: 'true',
  OPENCLAW_PROPOSALS_ENABLED: 'true',
} as const;

const API_ENV = {
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  OPENCLAW_API_KEY_ID: KEY_ID,
  OPENCLAW_API_SECRET: SECRET,
  NODE_ENV: 'test',
} as const;

function signedRequest(input: {
  method: string;
  pathname: string;
  rawBody?: string;
  requestId?: string;
}) {
  const timestamp = String(Date.now());
  const requestId = input.requestId ?? `req-${Math.random().toString(16).slice(2)}`;
  const rawBody = input.rawBody ?? '';
  const signature = signCanonical(
    SECRET,
    buildCanonicalString({
      timestamp,
      requestId,
      method: input.method,
      pathname: input.pathname,
      rawBody,
    }),
  );
  return {
    timestamp,
    signature,
    keyId: KEY_ID,
    requestId,
    rawBody,
  };
}

async function withEnv<T>(env: Record<string, string>, fn: () => Promise<T> | T): Promise<T> {
  const keys = Object.keys(env);
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      const prev = previous.get(key);
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }
}

test('openclaw proposals: flags requieren ambas compuertas', () => {
  assert.equal(isOpenClawProposalsEnabled({}), false);
  assert.equal(isOpenClawProposalsEnabled({ OPENCLAW_PROPOSALS_ENABLED: 'true' }), false);
  assert.equal(isOpenClawProposalsEnabled({ WRITE_ACTIONS_ENABLED: 'true' }), false);
  assert.equal(
    isOpenClawProposalsEnabled({
      OPENCLAW_PROPOSALS_ENABLED: 'TRUE',
      WRITE_ACTIONS_ENABLED: 'true',
    }),
    false,
  );
  assert.equal(
    isOpenClawProposalsEnabled({
      OPENCLAW_PROPOSALS_ENABLED: 'true',
      WRITE_ACTIONS_ENABLED: 'true',
    }),
    true,
  );
});

test('openclaw proposals: capabilities proposal-only vs direct-write', () => {
  const off = listOpenClawCapabilities({});
  assert.equal(off.filter((item) => item.kind === 'proposal').length, 0);
  assert.ok(off.some((item) => item.id === 'inbox.capture.propose' && item.kind === 'forbidden'));
  assert.ok(off.some((item) => item.id === 'inbox.capture' && item.kind === 'forbidden'));
  assert.ok(off.some((item) => item.id === 'proposal.approve' && item.kind === 'forbidden'));

  const on = listOpenClawCapabilities({
    OPENCLAW_PROPOSALS_ENABLED: 'true',
    WRITE_ACTIONS_ENABLED: 'true',
  });
  const proposalIds = [
    'task.create.propose',
    'task.change-status.propose',
    'inbox.capture.propose',
    'gym.session.create.propose',
    'calendar.hold.create.propose',
  ];
  for (const id of proposalIds) {
    assert.ok(
      on.some((item) => item.id === id && item.kind === 'proposal'),
      id,
    );
  }
  assert.ok(on.some((item) => item.id === 'task.create' && item.kind === 'forbidden'));
  assert.ok(on.some((item) => item.id === 'calendar.hold.create' && item.kind === 'forbidden'));
  assert.ok(on.some((item) => item.id === 'proposal.approve' && item.kind === 'forbidden'));
  assert.ok(on.some((item) => item.id === 'action.rollback' && item.kind === 'forbidden'));
  assert.equal(
    on.some((item) => item.id === 'calendar.block.propose'),
    false,
  );
});

test('openclaw proposals: readiness openclawProposals component', () => {
  const disabled = getOpenClawReadiness({
    ...API_ENV,
    OPENCLAW_RATE_LIMIT_MODE: 'memory',
    OPENCLAW_REPLAY_MODE: 'memory',
  });
  assert.equal(disabled.openclawProposals, 'disabled');

  const ready = getOpenClawReadiness({
    ...API_ENV,
    ...WRITE_MEMORY_ENV,
    OPENCLAW_RATE_LIMIT_MODE: 'memory',
    OPENCLAW_REPLAY_MODE: 'memory',
  });
  assert.equal(ready.openclawProposals, 'ready');
});

test('openclaw proposals: parse rechaza approve/actor/direct-write', () => {
  assert.equal(isOpenClawProposeOperation('proposal.approve'), false);
  assert.equal(parseOpenClawProposalRequest({ operation: 'proposal.approve' }).ok, false);
  assert.equal(parseOpenClawProposalRequest({ operation: 'task.create' }).ok, false);
  assert.equal(
    parseOpenClawProposalRequest({
      operation: 'inbox.capture.propose',
      actorId: 'evil',
      idempotencyKey: 'k',
      reason: 'r',
      expectedChange: 'c',
      risk: 'low',
      reversible: true,
      payload: { text: 'hola' },
    }).ok,
    false,
  );
  assert.equal(
    parseOpenClawProposalRequest({
      operation: 'inbox.capture.propose',
      actionType: 'proposal.approve',
      idempotencyKey: 'k',
      reason: 'r',
      expectedChange: 'c',
      risk: 'low',
      reversible: true,
      payload: { text: 'hola' },
    }).ok,
    false,
  );
});

test('openclaw proposals: create success con memory ports', async () => {
  const proposals = createMemoryProposalPort();
  const created = await createOpenClawProposal({
    keyId: KEY_ID,
    requestId: 'req-create-1',
    env: WRITE_MEMORY_ENV,
    runtimeOverrides: {
      proposals,
      idempotency: createMemoryIdempotencyStore(),
      audit: createMemoryAuditSink(),
    },
    request: {
      operation: 'inbox.capture.propose',
      idempotencyKey: 'oc-inbox-1',
      reason: 'Captura rápida',
      expectedChange: 'Nueva captura pendiente',
      risk: 'low',
      reversible: true,
      payload: {
        text: 'Idea desde OpenClaw',
        link: null,
        capturedAt: '2027-07-28T12:00:00.000Z',
        origin: 'openclaw',
      },
    },
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.match(created.proposalKey, /^prop-/);
  assert.equal(created.replay, false);
  assert.equal(created.risk, 'low');
  assert.ok(created.expiresAt);
  assert.ok(created.diff);
  assert.equal((await proposals.list('pending')).length, 1);
  assert.equal((await proposals.list())[0]?.source, 'openclaw');
});

test('openclaw proposals: no approve vía createOpenClawProposal / parse', async () => {
  const parsed = parseOpenClawProposalRequest({
    operation: 'proposal.approve',
    idempotencyKey: 'x',
    reason: 'r',
    expectedChange: 'c',
    risk: 'low',
    reversible: true,
    payload: { proposalKey: 'prop-1' },
  });
  assert.equal(parsed.ok, false);

  const denied = await createOpenClawProposal({
    keyId: KEY_ID,
    requestId: 'req-deny',
    env: {},
    request: {
      operation: 'inbox.capture.propose',
      idempotencyKey: 'x',
      reason: 'r',
      expectedChange: 'c',
      risk: 'low',
      reversible: true,
      payload: { text: 'no' },
    },
  });
  assert.equal(denied.ok, false);
  if (denied.ok) return;
  assert.equal(denied.code, 'flag-disabled');
});

test('openclaw proposals: GET metadata de propuesta propia (openclaw)', async () => {
  const proposals = createMemoryProposalPort();
  const created = await createOpenClawProposal({
    keyId: KEY_ID,
    requestId: 'req-get-1',
    env: WRITE_MEMORY_ENV,
    runtimeOverrides: {
      proposals,
      idempotency: createMemoryIdempotencyStore(),
      audit: createMemoryAuditSink(),
    },
    request: {
      operation: 'calendar.hold.create.propose',
      idempotencyKey: 'oc-hold-1',
      reason: 'Bloque de foco',
      expectedChange: '60m hold',
      risk: 'medium',
      reversible: true,
      payload: {
        title: 'Deep work',
        start: '2027-07-28T15:00:00.000Z',
        end: '2027-07-28T16:00:00.000Z',
        note: 'foco',
        relatedTaskKey: null,
      },
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const row = await getOpenClawProposal(created.proposalKey, WRITE_MEMORY_ENV, { proposals });
  assert.ok(row);
  const meta = toOpenClawProposalMetadata(row!);
  assert.equal(meta.proposalKey, created.proposalKey);
  assert.equal(meta.status, 'pending');
  assert.equal(meta.risk, 'medium');
  assert.equal(meta.source, 'openclaw');
  assert.ok(meta.diff);
});

test('openclaw proposals: POST 403 cuando flags off', async () => {
  await withEnv(
    { ...API_ENV, OPENCLAW_PROPOSALS_ENABLED: 'false', WRITE_ACTIONS_ENABLED: 'false' },
    async () => {
      const body = JSON.stringify({
        operation: 'inbox.capture.propose',
        idempotencyKey: 'http-off-1',
        reason: 'r',
        expectedChange: 'c',
        risk: 'low',
        reversible: true,
        payload: { text: 'hola', origin: 'openclaw' },
      });
      const signed = signedRequest({
        method: 'POST',
        pathname: '/api/openclaw/v1/proposals',
        rawBody: body,
      });
      const response = await postProposals(
        new Request('https://example.test/api/openclaw/v1/proposals', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-vida-key-id': signed.keyId,
            'x-vida-timestamp': signed.timestamp,
            'x-vida-signature': signed.signature,
            'x-vida-request-id': signed.requestId,
          },
          body,
        }),
      );
      assert.equal(response.status, 403);
      const json = (await response.json()) as { error: { code: string } };
      assert.equal(json.error.code, 'forbidden');
    },
  );
});

test('openclaw proposals: POST create success HTTP', async () => {
  await withEnv({ ...API_ENV, ...WRITE_MEMORY_ENV }, async () => {
    const body = JSON.stringify({
      operation: 'inbox.capture.propose',
      idempotencyKey: `http-on-${Date.now()}`,
      reason: 'Captura HTTP',
      expectedChange: 'Nueva captura',
      risk: 'low',
      reversible: true,
      payload: {
        text: 'Captura vía ruta',
        link: null,
        capturedAt: '2027-07-28T13:00:00.000Z',
        origin: 'openclaw',
      },
    });
    const signed = signedRequest({
      method: 'POST',
      pathname: '/api/openclaw/v1/proposals',
      rawBody: body,
    });
    const response = await postProposals(
      new Request('https://example.test/api/openclaw/v1/proposals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vida-key-id': signed.keyId,
          'x-vida-timestamp': signed.timestamp,
          'x-vida-signature': signed.signature,
          'x-vida-request-id': signed.requestId,
        },
        body,
      }),
    );
    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      ok: boolean;
      proposalKey: string;
      risk: string;
      expiresAt: string | null;
      diff: unknown;
      status: string;
    };
    assert.equal(json.ok, true);
    assert.match(json.proposalKey, /^prop-/);
    assert.equal(json.risk, 'low');
    assert.ok(json.expiresAt);
    assert.ok(json.diff);
    assert.equal(json.status, 'pending');
  });
});

test('openclaw proposals: GET 403 cuando flags off', async () => {
  await withEnv({ ...API_ENV, WRITE_ACTIONS_ENABLED: 'false' }, async () => {
    const getPath = '/api/openclaw/v1/proposals/prop-testkey';
    const getSigned = signedRequest({ method: 'GET', pathname: getPath });
    const getResponse = await getProposal(
      new Request(`https://example.test${getPath}`, {
        method: 'GET',
        headers: {
          'x-vida-key-id': getSigned.keyId,
          'x-vida-timestamp': getSigned.timestamp,
          'x-vida-signature': getSigned.signature,
          'x-vida-request-id': getSigned.requestId,
        },
      }),
      { params: Promise.resolve({ key: 'prop-testkey' }) },
    );
    assert.equal(getResponse.status, 403);
  });
});

test('openclaw proposals: POST rechaza approve operation', async () => {
  await withEnv({ ...API_ENV, ...WRITE_MEMORY_ENV }, async () => {
    const body = JSON.stringify({
      operation: 'proposal.approve',
      idempotencyKey: 'http-approve',
      reason: 'r',
      expectedChange: 'c',
      risk: 'low',
      reversible: true,
      payload: { proposalKey: 'prop-x' },
    });
    const signed = signedRequest({
      method: 'POST',
      pathname: '/api/openclaw/v1/proposals',
      rawBody: body,
    });
    const response = await postProposals(
      new Request('https://example.test/api/openclaw/v1/proposals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vida-key-id': signed.keyId,
          'x-vida-timestamp': signed.timestamp,
          'x-vida-signature': signed.signature,
          'x-vida-request-id': signed.requestId,
        },
        body,
      }),
    );
    assert.equal(response.status, 400);
    const json = (await response.json()) as { error: { code: string } };
    assert.equal(json.error.code, 'invalid-input');
  });
});

test('openclaw proposals: sin regresión en health/capabilities read', async () => {
  await withEnv({ ...API_ENV }, async () => {
    const healthPath = '/api/openclaw/v1/health';
    const healthSigned = signedRequest({ method: 'GET', pathname: healthPath });
    const health = await getHealth(
      new Request(`https://example.test${healthPath}`, {
        method: 'GET',
        headers: {
          'x-vida-key-id': healthSigned.keyId,
          'x-vida-timestamp': healthSigned.timestamp,
          'x-vida-signature': healthSigned.signature,
          'x-vida-request-id': healthSigned.requestId,
        },
      }),
    );
    assert.equal(health.status, 200);
    const healthJson = (await health.json()) as { accessMode: string; ok: boolean };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.accessMode, 'read-only');

    const capsPath = '/api/openclaw/v1/capabilities';
    const capsSigned = signedRequest({ method: 'GET', pathname: capsPath });
    const caps = await getCapabilities(
      new Request(`https://example.test${capsPath}`, {
        method: 'GET',
        headers: {
          'x-vida-key-id': capsSigned.keyId,
          'x-vida-timestamp': capsSigned.timestamp,
          'x-vida-signature': capsSigned.signature,
          'x-vida-request-id': capsSigned.requestId,
        },
      }),
    );
    assert.equal(caps.status, 200);
    const capsJson = (await caps.json()) as {
      proposal: unknown[];
      forbidden: { id: string; kind: string }[];
      read: unknown[];
    };
    assert.equal(capsJson.proposal.length, 0);
    assert.ok(capsJson.read.length > 0);
    assert.ok(capsJson.forbidden.some((item) => item.id === 'proposal.approve'));
  });
});

test('openclaw proposals: rutas no llaman buildWriteRuntime directamente', () => {
  for (const routePath of [
    'app/api/openclaw/v1/proposals/route.ts',
    'app/api/openclaw/v1/proposals/[key]/route.ts',
  ]) {
    const source = readFileSync(path.join(process.cwd(), routePath), 'utf8');
    assert.match(source, /isOpenClawProposalsEnabled/);
    assert.equal(source.includes('buildWriteRuntime('), false);
  }
});
