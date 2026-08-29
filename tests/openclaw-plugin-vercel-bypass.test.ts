import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  executeVidaOperation,
  type FetchLike,
  type MinimalResponse,
} from '../openclaw-plugin/vida-2-0-api/src/dispatcher';
import type { VidaAgentCredential } from '../openclaw-plugin/vida-2-0-api/src/secrets';
import type { VidaOperationCall } from '../openclaw-plugin/vida-2-0-api/src/types';

const FIXTURE_CREDENTIAL: VidaAgentCredential = {
  keyId: 'fixture-key-id-not-real',
  secret: 'fixture-secret-not-real-never-committed-as-a-real-value',
};
const FIXTURE_BYPASS = 'fixture-bypass-value-not-real-never-committed';
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

function baseDeps(fetchLike: FetchLike) {
  return {
    fetch: fetchLike,
    now: () => FIXED_NOW,
    requestId: () => FIXED_REQUEST_ID,
    resolveSecret: () => FIXTURE_CREDENTIAL,
  };
}

const READ_CALL: VidaOperationCall = { operation: 'areas.list', input: {} };
const OK_RESPONSE = { ok: true, requestId: FIXED_REQUEST_ID, data: [] };

test('no bypass configured: x-vercel-protection-bypass header is entirely absent', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() => jsonResponse(200, OK_RESPONSE));
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, true);
  const sent = calls[0]!;
  assert.equal('x-vercel-protection-bypass' in sent.headers, false);
});

test('bypass configured: the exact fixed header is present with the configured value', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() => jsonResponse(200, OK_RESPONSE));
  const result = await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida-preview.example.com', vercelProtectionBypass: FIXTURE_BYPASS },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, true);
  const sent = calls[0]!;
  assert.equal(sent.headers['x-vercel-protection-bypass'], FIXTURE_BYPASS);
});

test('an empty-string bypass value behaves as absent (no header sent)', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() => jsonResponse(200, OK_RESPONSE));
  await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com', vercelProtectionBypass: '' },
    deps: baseDeps(fetchLike),
  });
  assert.equal('x-vercel-protection-bypass' in calls[0]!.headers, false);
});

test('bypass presence never changes the HMAC signature: identical canonical inputs sign identically with or without it', async () => {
  const withoutBypass = makeCapturingFetch(() => jsonResponse(200, OK_RESPONSE));
  await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(withoutBypass.fetchLike),
  });

  const withBypass = makeCapturingFetch(() => jsonResponse(200, OK_RESPONSE));
  await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida.example.com', vercelProtectionBypass: FIXTURE_BYPASS },
    deps: baseDeps(withBypass.fetchLike),
  });

  const signatureWithout = withoutBypass.calls[0]!.headers['X-Vida-Signature'];
  const signatureWith = withBypass.calls[0]!.headers['X-Vida-Signature'];
  assert.equal(signatureWith, signatureWithout);

  // Every other signed header is identical too -- only the new transport
  // header differs between the two requests.
  const withoutExtra = Object.fromEntries(
    Object.entries(withBypass.calls[0]!.headers).filter(
      ([name]) => name !== 'x-vercel-protection-bypass',
    ),
  );
  assert.deepEqual(withoutExtra, withoutBypass.calls[0]!.headers);
  assert.equal(withBypass.calls[0]!.body, withoutBypass.calls[0]!.body);
  assert.equal(withBypass.calls[0]!.url, withoutBypass.calls[0]!.url);
});

test('bypass cannot become an arbitrary header: the only header key introduced is exactly x-vercel-protection-bypass', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() => jsonResponse(200, OK_RESPONSE));
  await executeVidaOperation({
    agentId: 'steward',
    call: READ_CALL,
    config: { baseUrl: 'https://vida-preview.example.com', vercelProtectionBypass: FIXTURE_BYPASS },
    deps: baseDeps(fetchLike),
  });
  const headerNames = Object.keys(calls[0]!.headers).sort();
  assert.deepEqual(headerNames, [
    'Content-Type',
    'X-Vida-Key-Id',
    'X-Vida-Request-Id',
    'X-Vida-Signature',
    'X-Vida-Timestamp',
    'x-vercel-protection-bypass',
  ]);
});

test('model/tool call parameters cannot supply or override the bypass value: only config controls it', async () => {
  const { fetchLike: fetchWithout, calls: callsWithout } = makeCapturingFetch(() =>
    jsonResponse(200, OK_RESPONSE),
  );
  const modelSuppliedCall = {
    ...READ_CALL,
    vercelProtectionBypass: 'model-supplied-value',
  } as unknown as VidaOperationCall;
  await executeVidaOperation({
    agentId: 'steward',
    call: modelSuppliedCall,
    config: { baseUrl: 'https://vida.example.com' },
    deps: baseDeps(fetchWithout),
  });
  assert.equal('x-vercel-protection-bypass' in callsWithout[0]!.headers, false);

  const { fetchLike: fetchWith, calls: callsWith } = makeCapturingFetch(() =>
    jsonResponse(200, OK_RESPONSE),
  );
  await executeVidaOperation({
    agentId: 'steward',
    call: modelSuppliedCall,
    config: { baseUrl: 'https://vida.example.com', vercelProtectionBypass: FIXTURE_BYPASS },
    deps: baseDeps(fetchWith),
  });
  assert.equal(callsWith[0]!.headers['x-vercel-protection-bypass'], FIXTURE_BYPASS);
  assert.notEqual(callsWith[0]!.headers['x-vercel-protection-bypass'], 'model-supplied-value');
});

test('bypass value never appears in a returned error result', async () => {
  const { fetchLike } = makeCapturingFetch(() =>
    jsonResponse(403, { ok: false, error: { code: 'forbidden' } }),
  );
  const result = await executeVidaOperation({
    agentId: 'digital-order',
    call: READ_CALL,
    config: { baseUrl: 'https://vida-preview.example.com', vercelProtectionBypass: FIXTURE_BYPASS },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(FIXTURE_BYPASS), false);
});

test('digital-order remains inert even with a Vercel bypass configured', async () => {
  const { fetchLike, calls } = makeCapturingFetch(() => jsonResponse(200, OK_RESPONSE));
  const result = await executeVidaOperation({
    agentId: 'digital-order',
    call: { operation: 'tasks.list', input: {} },
    config: { baseUrl: 'https://vida-preview.example.com', vercelProtectionBypass: FIXTURE_BYPASS },
    deps: baseDeps(fetchLike),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'operation-not-allowed');
  assert.equal(
    calls.length,
    0,
    'must not contact Vida for a denied operation regardless of bypass config',
  );
});
