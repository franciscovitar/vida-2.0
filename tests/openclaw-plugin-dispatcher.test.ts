import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  VIDA_HMAC_PROTOCOL,
  buildCanonicalString,
} from '../openclaw-plugin/vida-2-0-api/src/canonical';
import {
  executeVidaOperation,
  type FetchLike,
  type MinimalResponse,
} from '../openclaw-plugin/vida-2-0-api/src/dispatcher';
import type {
  VidaAgentCredential,
  SecretResolver,
} from '../openclaw-plugin/vida-2-0-api/src/secrets';
import type { VidaOperationCall } from '../openclaw-plugin/vida-2-0-api/src/types';

const FIXTURE_CREDENTIAL: VidaAgentCredential = {
  keyId: 'fixture-key-id-not-real',
  secret: 'fixture-secret-not-real-never-committed-as-a-real-value',
};

const FIXED_NOW = 1_700_000_000_000;
const FIXED_REQUEST_ID = 'fixture-request-id-0001';

type CapturedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
};

function jsonResponse(status: number, body: unknown): MinimalResponse {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}

function textResponse(status: number, body: string): MinimalResponse {
  return { status, ok: status >= 200 && status < 300, text: async () => body };
}

function makeCapturingFetch(
  respond: (req: CapturedRequest) => MinimalResponse | Promise<MinimalResponse>,
) {
  const calls: CapturedRequest[] = [];
  const fetchLike: FetchLike = async (url, init) => {
    const captured: CapturedRequest = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    };
    calls.push(captured);
    return respond(captured);
  };
  return { fetchLike, calls };
}

function baseDeps(fetchLike: FetchLike, resolveSecret: SecretResolver = () => FIXTURE_CREDENTIAL) {
  return {
    fetch: fetchLike,
    now: () => FIXED_NOW,
    requestId: () => FIXED_REQUEST_ID,
    resolveSecret,
  };
}

const READ_CALL: VidaOperationCall = { operation: 'areas.list', input: {} };
const HEALTH_CALL: VidaOperationCall = { operation: 'system.health' };
const PROPOSE_CALL: VidaOperationCall = {
  operation: 'task.create.propose',
  idempotencyKey: 'idem-1',
  reason: 'test reason',
  expectedChange: 'creates one task',
  risk: 'low',
  reversible: true,
  targetKey: null,
  payload: { title: 'Test task' },
};

test('canonical body bytes are the same bytes hashed and the same bytes sent (read operation)', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID, data: [] }),
  );
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const sent = calls[0]!;
  assert.equal(sent.body, JSON.stringify({ operation: 'areas.list', input: {} }));

  const expectedBodyHash = createHash('sha256')
    .update(Buffer.from(sent.body ?? '', 'utf8'))
    .digest('hex');
  const expectedCanonical = [
    VIDA_HMAC_PROTOCOL,
    sent.headers['X-Vida-Timestamp'],
    sent.headers['X-Vida-Request-Id'],
    'POST',
    '/api/openclaw/v1/read',
    expectedBodyHash,
  ].join('\n');
  const expectedSignature = createHmac('sha256', FIXTURE_CREDENTIAL.secret)
    .update(expectedCanonical)
    .digest('hex');
  assert.equal(sent.headers['X-Vida-Signature'], expectedSignature);
});

test('valid HMAC canonicalization: signature matches buildCanonicalString + signCanonical over the sent headers/body', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID, data: {} }),
  );
  await executeVidaOperation({
    agentId: 'technical-guardian',
    call: { operation: 'technical.status', input: {} },
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  const sent = calls[0]!;
  const canonical = buildCanonicalString({
    timestamp: sent.headers['X-Vida-Timestamp']!,
    requestId: sent.headers['X-Vida-Request-Id']!,
    method: 'POST',
    pathname: '/api/openclaw/v1/read',
    rawBody: sent.body ?? '',
  });
  const expectedSignature = createHmac('sha256', FIXTURE_CREDENTIAL.secret)
    .update(canonical)
    .digest('hex');
  assert.equal(sent.headers['X-Vida-Signature'], expectedSignature);
  assert.match(sent.headers['X-Vida-Signature']!, /^[0-9a-f]{64}$/);
});

test('GET operation sends no body and hashes the empty string', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID, agent: { id: 'steward' } }),
  );
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: HEALTH_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, true);
  const sent = calls[0]!;
  assert.equal(sent.method, 'GET');
  assert.equal(sent.body, undefined);
  assert.equal(sent.url, 'https://vida.example.com/api/openclaw/v1/health');
  assert.equal(sent.headers['Content-Type'], undefined);

  const expectedCanonical = buildCanonicalString({
    timestamp: sent.headers['X-Vida-Timestamp']!,
    requestId: sent.headers['X-Vida-Request-Id']!,
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
  });
  const expectedSignature = createHmac('sha256', FIXTURE_CREDENTIAL.secret)
    .update(expectedCanonical)
    .digest('hex');
  assert.equal(sent.headers['X-Vida-Signature'], expectedSignature);
});

test('no query strings: the constructed URL never contains a "?"', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID, data: [] }),
  );
  await executeVidaOperation({
    agentId: 'steward',
    call: { operation: 'tasks.list', input: { limit: 10, status: 'Pendiente' } },
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(calls[0]!.url.includes('?'), false);
});

test('unknown agent is denied before any network call', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID }),
  );
  const result = await executeVidaOperation({
    agentId: 'planner',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unknown-agent');
  assert.equal(calls.length, 0, 'must not contact Vida for an unknown agent');
});

test('unsupported operation is denied before any network call: arbitrary URL/path/method impossible', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID }),
  );
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: { operation: 'admin.deleteEverything' as never, input: {} },
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unsupported-operation');
  assert.equal(calls.length, 0);
});

test('operation not allowed for the trusted agent is denied before any network call', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID }),
  );
  const result = await executeVidaOperation({
    agentId: 'digital-order',
    call: { operation: 'tasks.list', input: {} },
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'operation-not-allowed');
  assert.equal(calls.length, 0);
});

test('missing credential fails closed before any network call', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID }),
  );
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike, () => null),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'missing-credential');
  assert.equal(calls.length, 0, 'must not contact Vida with no credential');
});

test('invalid base URL configuration fails closed before any network call', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID }),
  );
  for (const baseUrl of [
    '',
    'not-a-url',
    'http://vida.example.com',
    'https://vida.example.com?x=1',
  ]) {
    const result = await executeVidaOperation({
      agentId: 'steward',
      call: READ_CALL,
      config: { baseUrl },
      deps: baseDeps(fetchLike),
    });
    assert.equal(
      result.ok,
      false,
      `expected invalid-configuration for baseUrl=${JSON.stringify(baseUrl)}`,
    );
    if (!result.ok) assert.equal(result.code, 'invalid-configuration');
  }
  assert.equal(calls.length, 0);
});

test('malformed proposal call shape (missing required envelope fields) is rejected as invalid-input', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID }),
  );
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: { operation: 'task.create.propose', payload: {} } as unknown as VidaOperationCall,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'invalid-input');
  assert.equal(calls.length, 0);
});

test('malformed/unexpected Vida response shape fails closed (invalid JSON)', async () => {
  const { fetchLike } = makeCapturingFetch(() => textResponse(200, 'not json'));
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unexpected-response');
});

test('malformed/unexpected Vida response shape fails closed (valid JSON, wrong shape)', async () => {
  const { fetchLike } = makeCapturingFetch(() => jsonResponse(200, { unexpected: 'shape' }));
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unexpected-response');
});

test('a non-2xx Vida response is a failure and never becomes a success result', async () => {
  const { fetchLike } = makeCapturingFetch(() =>
    jsonResponse(403, { ok: false, error: { code: 'forbidden', message: 'nope' } }),
  );
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'http-error');
    assert.equal(result.status, 403);
  }
});

test('proposal ambiguous network failure is not retried: exactly one fetch attempt', async () => {
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    throw new Error('ECONNRESET (simulated ambiguous network outcome)');
  };
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: PROPOSE_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'network-error');
  assert.equal(calls, 1, 'a proposal must never be retried after an ambiguous network outcome');
});

test('a non-propose operation network failure is also never retried', async () => {
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    throw new Error('simulated network failure');
  };
  await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(calls, 1);
});

test('no secret, signature, or canonical signing string ever appears in a returned error result', async () => {
  const scenarios: Array<() => Promise<unknown>> = [
    () =>
      executeVidaOperation({
        agentId: 'planner',
        call: READ_CALL,
        config: { baseUrl: 'https://vida.example.com' },
        deps: baseDeps(makeCapturingFetch(() => jsonResponse(200, {})).fetchLike),
      }),
    () =>
      executeVidaOperation({
        agentId: 'steward',
        call: READ_CALL,
        config: { baseUrl: 'https://vida.example.com' },
        deps: baseDeps(makeCapturingFetch(() => jsonResponse(200, {})).fetchLike, () => null),
      }),
    () =>
      executeVidaOperation({
        agentId: 'steward',
        call: READ_CALL,
        config: { baseUrl: 'https://vida.example.com' },
        deps: baseDeps(
          makeCapturingFetch(() => jsonResponse(403, { ok: false, error: { code: 'forbidden' } }))
            .fetchLike,
        ),
      }),
  ];

  for (const run of scenarios) {
    const result = await run();
    const serialized = JSON.stringify(result);
    assert.equal(
      serialized.includes(FIXTURE_CREDENTIAL.secret),
      false,
      'secret leaked into result',
    );
    assert.equal(serialized.includes(FIXTURE_CREDENTIAL.keyId), false, 'key id leaked into result');
    assert.equal(
      serialized.includes(VIDA_HMAC_PROTOCOL),
      false,
      'canonical signing protocol string leaked into result',
    );
    assert.equal(
      /[0-9a-f]{64}/.test(serialized),
      false,
      'a 64-hex-char value (signature/body-hash shape) leaked into result',
    );
  }
});

test('a successful result never carries the signature, canonical string, or secret either', async () => {
  const { fetchLike } = makeCapturingFetch(() =>
    jsonResponse(200, { ok: true, requestId: FIXED_REQUEST_ID, data: { items: [] } }),
  );
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(FIXTURE_CREDENTIAL.secret), false);
  assert.equal(serialized.includes(FIXTURE_CREDENTIAL.keyId), false);
  assert.equal(serialized.includes(VIDA_HMAC_PROTOCOL), false);
});
