import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleManualDeliveryClaimRequest } from '@/lib/automations/delivery-claim';
import { createMemoryAutomationStateStore } from '@/lib/automations/store';
import type { AutomationRunRecord } from '@/types/automations';

const SECRET = 'manual-delivery-claim-secret-safe-value';
const BASE_ENV = {
  NODE_ENV: 'test',
  AUTOMATIONS_API_ENABLED: 'true',
  AUTOMATIONS_ACCESS_MODE: 'read-only',
  AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
  AUTOMATIONS_MANUAL_RUN_ENABLED: 'true',
  AUTOMATIONS_N8N_TEMPLATES_PROVISIONED: 'true',
  AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
  AUTOMATIONS_N8N_BASE_URL: 'http://localhost:5678',
  AUTOMATIONS_N8N_WEBHOOK_SECRET: SECRET,
} as const;

const RUN_KEY = 'run_abcdefghijklmnopqrstuvwx';
const IDEMPOTENCY_KEY = 'manual:123e4567-e89b-42d3-a456-426614174000';
const CREATED_AT = '2026-08-22T20:00:00.000Z';

function runningRun(): AutomationRunRecord {
  return {
    runKey: RUN_KEY,
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    principalId: 'workflow:daily-briefing',
    trigger: 'manual',
    status: 'running',
    attempt: 1,
    idempotencyKey: IDEMPOTENCY_KEY,
    startedAt: CREATED_AT,
    finishedAt: null,
    durationMs: null,
    resultCode: null,
    summary: null,
    proposalKey: null,
    artifactKey: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    expiresAt: '2026-08-24T20:00:00.000Z',
  };
}

function claimRequest(input: { requestKey: string; attempt: number; trigger: 'manual' | 'retry' }) {
  const body = {
    runKey: RUN_KEY,
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestKey: input.requestKey,
    attempt: input.attempt,
    trigger: input.trigger,
    contractVersion: 'vida2-automations-v1',
  };
  return new Request('http://localhost/api/automations/v1/deliveries/claim', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vida-automations-secret': SECRET,
      'x-vida-request-id': `claim:${input.requestKey}`,
    },
    body: JSON.stringify(body),
  });
}

test('block5 delivery claim: first effective delivery executes, same transport retry remains executable, later Vida retry does not redispatch', async () => {
  const store = createMemoryAutomationStateStore();
  await store.putRun(runningRun(), 48 * 60 * 60);

  const firstRequestKey = 'request_abcdefghijklmnopqrstuvwx';
  const first = await handleManualDeliveryClaimRequest(
    claimRequest({ requestKey: firstRequestKey, attempt: 1, trigger: 'manual' }),
    { env: BASE_ENV, store },
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    ok: true,
    shouldExecute: true,
    runKey: RUN_KEY,
    requestKey: firstRequestKey,
  });

  const sameTransportRetry = await handleManualDeliveryClaimRequest(
    claimRequest({ requestKey: firstRequestKey, attempt: 1, trigger: 'manual' }),
    { env: BASE_ENV, store },
  );
  assert.equal(sameTransportRetry.status, 200);
  assert.deepEqual(await sameTransportRetry.json(), {
    ok: true,
    shouldExecute: true,
    runKey: RUN_KEY,
    requestKey: firstRequestKey,
  });

  const retryRequestKey = 'request_zyxwvutsrqponmlkjihgfedc';
  const laterVidaRetry = await handleManualDeliveryClaimRequest(
    claimRequest({ requestKey: retryRequestKey, attempt: 2, trigger: 'retry' }),
    { env: BASE_ENV, store },
  );
  assert.equal(laterVidaRetry.status, 200);
  assert.deepEqual(await laterVidaRetry.json(), {
    ok: true,
    shouldExecute: false,
    runKey: RUN_KEY,
    requestKey: retryRequestKey,
  });
});

test('block5 delivery claim: attempt 2 can become the first effective delivery when attempt 1 never claimed', async () => {
  const store = createMemoryAutomationStateStore();
  const run = { ...runningRun(), attempt: 2, trigger: 'retry' as const };
  await store.putRun(run, 48 * 60 * 60);

  const retryRequestKey = 'request_zyxwvutsrqponmlkjihgfedc';
  const second = await handleManualDeliveryClaimRequest(
    claimRequest({ requestKey: retryRequestKey, attempt: 2, trigger: 'retry' }),
    { env: BASE_ENV, store },
  );
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), {
    ok: true,
    shouldExecute: true,
    runKey: RUN_KEY,
    requestKey: retryRequestKey,
  });
});

test('block5 delivery claim: auth, run identity and exact DTO fail closed', async () => {
  const store = createMemoryAutomationStateStore();
  await store.putRun(runningRun(), 48 * 60 * 60);

  const requestKey = 'request_abcdefghijklmnopqrstuvwx';
  const unauthorized = claimRequest({ requestKey, attempt: 1, trigger: 'manual' });
  unauthorized.headers.set('x-vida-automations-secret', 'wrong-secret-with-safe-length');
  assert.equal(
    (await handleManualDeliveryClaimRequest(unauthorized, { env: BASE_ENV, store })).status,
    401,
  );

  const wrongRun = claimRequest({ requestKey, attempt: 1, trigger: 'manual' });
  const body = (await wrongRun.json()) as Record<string, unknown>;
  body.idempotencyKey = 'manual:123e4567-e89b-42d3-a456-426614174999';
  const mismatch = new Request(wrongRun.url, {
    method: 'POST',
    headers: wrongRun.headers,
    body: JSON.stringify(body),
  });
  assert.equal(
    (await handleManualDeliveryClaimRequest(mismatch, { env: BASE_ENV, store })).status,
    409,
  );

  const invalid = claimRequest({ requestKey, attempt: 1, trigger: 'manual' });
  const invalidBody = (await invalid.json()) as Record<string, unknown>;
  invalidBody.unexpected = true;
  const extraKey = new Request(invalid.url, {
    method: 'POST',
    headers: invalid.headers,
    body: JSON.stringify(invalidBody),
  });
  assert.equal(
    (await handleManualDeliveryClaimRequest(extraKey, { env: BASE_ENV, store })).status,
    400,
  );
});
