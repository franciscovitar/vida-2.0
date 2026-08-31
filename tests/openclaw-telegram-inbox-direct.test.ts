import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  executeOpenClawTelegramInboxDirect,
  isOpenClawTelegramInboxDirectEnabled,
  parseOpenClawTelegramInboxDirectRequest,
} from '@/lib/openclaw/direct-inbox';
import { executeVidaOperation } from '../openclaw-plugin/vida-2-0-api/src/dispatcher';

const enabledEnv = {
  NODE_ENV: 'test',
  WRITE_ACTIONS_ENABLED: 'true',
  WRITE_ACTIONS_USE_MEMORY: 'true',
  CONVERSATIONAL_INBOX_DIRECT_APPLY_ENABLED: 'true',
  OPENCLAW_TELEGRAM_INBOX_DIRECT_ENABLED: 'true',
} as const;

function validEnvelope() {
  return {
    operation: 'inbox.capture.direct',
    transport: {
      channel: 'telegram',
      principalId: 'telegram:12345',
      sourceEventId: 'telegram:msg-77',
    },
    input: {
      text: 'Guardar filtro de agua en Bandeja',
      link: null,
    },
  } as const;
}

test('OTD1. Telegram direct apply requires all three exact true gates', () => {
  assert.equal(isOpenClawTelegramInboxDirectEnabled({}), false);
  assert.equal(
    isOpenClawTelegramInboxDirectEnabled({
      OPENCLAW_TELEGRAM_INBOX_DIRECT_ENABLED: 'true',
      CONVERSATIONAL_INBOX_DIRECT_APPLY_ENABLED: 'true',
      WRITE_ACTIONS_ENABLED: 'false',
    }),
    false,
  );
  assert.equal(
    isOpenClawTelegramInboxDirectEnabled({
      OPENCLAW_TELEGRAM_INBOX_DIRECT_ENABLED: 'TRUE',
      CONVERSATIONAL_INBOX_DIRECT_APPLY_ENABLED: 'true',
      WRITE_ACTIONS_ENABLED: 'true',
    }),
    false,
  );
  assert.equal(isOpenClawTelegramInboxDirectEnabled(enabledEnv), true);
});

test('OTD2. server parser accepts only the closed Telegram envelope', () => {
  const valid = parseOpenClawTelegramInboxDirectRequest(validEnvelope());
  assert.equal(valid.ok, true);

  for (const invalid of [
    { ...validEnvelope(), extra: true },
    { ...validEnvelope(), operation: 'inbox.capture.propose' },
    {
      ...validEnvelope(),
      transport: { ...validEnvelope().transport, channel: 'whatsapp' },
    },
    {
      ...validEnvelope(),
      transport: { ...validEnvelope().transport, principalId: '12345' },
    },
    {
      ...validEnvelope(),
      transport: { ...validEnvelope().transport, sourceEventId: 'msg-77' },
    },
    {
      ...validEnvelope(),
      input: { ...validEnvelope().input, text: '' },
    },
    {
      ...validEnvelope(),
      input: { ...validEnvelope().input, inventedTransportField: 'x' },
    },
  ]) {
    assert.equal(parseOpenClawTelegramInboxDirectRequest(invalid).ok, false);
  }
});

test('OTD3. enabled server helper reuses Safe Writes direct apply in memory-test mode', async () => {
  const result = await executeOpenClawTelegramInboxDirect(validEnvelope(), { env: enabledEnv });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.code, 'applied');
  assert.equal(result.verified, true);
});

test('OTD4. dispatcher sends direct capture once to the fixed path with HMAC and exact trusted body', async () => {
  let fetchCount = 0;
  let capturedUrl = '';
  let capturedInit:
    | { method: string; headers: Record<string, string>; body?: string }
    | undefined;

  const result = await executeVidaOperation({
    agentId: 'steward',
    call: validEnvelope(),
    config: { baseUrl: 'https://vida.example.test' },
    deps: {
      fetch: async (url, init) => {
        fetchCount += 1;
        capturedUrl = url;
        capturedInit = init;
        return {
          status: 200,
          ok: true,
          text: async () => JSON.stringify({ ok: true, requestId: 'req-direct-1' }),
        };
      },
      now: () => 1_800_000_000_000,
      requestId: () => 'req-direct-1',
      resolveSecret: async () => ({ keyId: 'fixture-key', secret: 'fixture-secret-not-real' }),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCount, 1);
  assert.equal(capturedUrl, 'https://vida.example.test/api/openclaw/v1/direct/inbox');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.headers['Content-Type'], 'application/json');
  assert.match(capturedInit?.headers['X-Vida-Signature'] ?? '', /^[0-9a-f]{64}$/);
  assert.deepEqual(JSON.parse(capturedInit?.body ?? '{}'), validEnvelope());
});

test('OTD5. non-steward direct call fails closed before any network attempt', async () => {
  let fetchCalled = false;
  const result = await executeVidaOperation({
    agentId: 'health-reflection',
    call: validEnvelope(),
    config: { baseUrl: 'https://vida.example.test' },
    deps: {
      fetch: async () => {
        fetchCalled = true;
        throw new Error('must not be called');
      },
      now: () => 1_800_000_000_000,
      requestId: () => 'req-direct-2',
      resolveSecret: async () => ({ keyId: 'fixture-key', secret: 'fixture-secret-not-real' }),
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'operation-not-allowed');
  assert.equal(fetchCalled, false);
});
