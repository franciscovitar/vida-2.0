import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCanonicalString, signCanonical } from '@/lib/openclaw/auth';
import { createMemoryOpenClawRateLimitPort } from '@/lib/openclaw/rate-limit';
import { createMemoryOpenClawReplayPort } from '@/lib/openclaw/replay';
import { resolveManualAutomationRequest } from '@/lib/automations/manual';
import { createAutomationRuntime } from '@/lib/automations/runtime';
import {
  handleScheduledAutomationRequest,
  isCanonicalScheduledOccurrence,
} from '@/lib/automations/schedule';
import { createMemoryAutomationStateStore } from '@/lib/automations/store';

const NOW = Date.parse('2026-08-03T10:15:00.000Z');
const PATHNAME = '/api/automations/v1/triggers/scheduled';
const ENDPOINT_URL = `http://localhost${PATHNAME}`;
const DAILY_SECRET = 'daily-secret-with-safe-length';

const ENV = {
  NODE_ENV: 'test',
  AUTOMATIONS_API_ENABLED: 'true',
  AUTOMATIONS_SCHEDULE_INGRESS_ENABLED: 'true',
  AUTOMATIONS_ACCESS_MODE: 'proposal-only',
  AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
  AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
  AUTOMATIONS_TECHNICAL_WATCHDOG_ENABLED: 'true',
  AUTOMATIONS_WEEKLY_REVIEW_ENABLED: 'true',
  AUTOMATIONS_APPROVAL_DIGEST_ENABLED: 'true',
  AUTOMATIONS_PLANNING_SUGGESTION_ENABLED: 'true',
  AUTOMATIONS_MANUAL_RUN_ENABLED: 'true',
  AUTOMATIONS_RESULT_CALLBACK_ENABLED: 'true',
  AUTOMATIONS_N8N_TEMPLATES_PROVISIONED: 'true',
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  OPENCLAW_RATE_LIMIT_MODE: 'memory',
  OPENCLAW_REPLAY_MODE: 'memory',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: 'daily-key',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: DAILY_SECRET,
  OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_KEY_ID: 'technical-key',
  OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_SECRET: 'technical-secret-with-safe-length',
  OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_KEY_ID: 'weekly-key',
  OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_SECRET: 'weekly-secret-with-safe-length',
  OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_KEY_ID: 'approval-steward-key',
  OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_SECRET:
    'approval-steward-secret-with-safe-length',
  OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_KEY_ID: 'approval-health-key',
  OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_SECRET: 'approval-health-secret-with-safe-length',
  OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_KEY_ID: 'planning-key',
  OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_SECRET: 'planning-secret-with-safe-length',
} as const;

function scheduleBody(
  workflowKey = 'daily-briefing',
  scheduledFor = '2026-08-03T10:15:00.000Z',
): string {
  return JSON.stringify({
    workflowKey,
    scheduledFor,
    contractVersion: 'vida2-automations-v1',
  });
}

function signedRequest(
  input: {
    body?: string | Uint8Array;
    keyId?: string;
    secret?: string;
    requestId?: string;
    timestamp?: number;
    method?: string;
    url?: string;
    contentType?: string;
  } = {},
): Request {
  const body = input.body ?? scheduleBody();
  const method = input.method ?? 'POST';
  const url = input.url ?? ENDPOINT_URL;
  const timestamp = String(input.timestamp ?? NOW);
  const requestId = input.requestId ?? 'schedule-request-0001';
  const canonical = buildCanonicalString({
    timestamp,
    requestId,
    method,
    pathname: new URL(url).pathname,
    rawBody: body,
  });
  let requestBody: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'string') requestBody = body;
    else {
      const copy = new ArrayBuffer(body.byteLength);
      new Uint8Array(copy).set(body);
      requestBody = copy;
    }
  }
  return new Request(url, {
    method,
    headers: {
      'content-type': input.contentType ?? 'application/json',
      'x-vida-key-id': input.keyId ?? 'daily-key',
      'x-vida-timestamp': timestamp,
      'x-vida-request-id': requestId,
      'x-vida-signature': signCanonical(input.secret ?? DAILY_SECRET, canonical),
    },
    body: requestBody,
  });
}

function endpointDeps(input: { now?: () => number; dispatch?: () => void } = {}) {
  const now = input.now ?? (() => NOW);
  const store = createMemoryAutomationStateStore(now);
  const runtime = createAutomationRuntime({
    store,
    env: ENV,
    now,
    orchestrator: {
      async trigger() {
        input.dispatch?.();
        return { accepted: true as const, requestKey: 'request_manual_only' };
      },
    },
  });
  return {
    store,
    runtime,
    deps: {
      env: ENV,
      runtime,
      now,
      rateLimit: createMemoryOpenClawRateLimitPort(),
      replay: createMemoryOpenClawReplayPort(),
      log: () => undefined,
    },
  };
}

test('block5 schedule runtime: begin crea el run canónico sin redispatch y manual despacha una vez', async () => {
  let dispatches = 0;
  const scheduled = endpointDeps({ dispatch: () => dispatches++ });
  const begun = await scheduled.runtime.beginScheduledRun({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    scheduledFor: '2026-08-03T10:15:00.000Z',
    contractVersion: 'vida2-automations-v1',
    payloadDigest: 'a'.repeat(64),
  });
  assert.equal(begun.code, 'accepted');
  assert.equal(begun.run?.status, 'running');
  assert.equal(dispatches, 0);

  const manual = endpointDeps({ dispatch: () => dispatches++ });
  const started = await manual.runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'manual',
    idempotencyKey: 'manual:single-dispatch',
    confirmed: true,
  });
  assert.equal(started.code, 'accepted');
  assert.equal(dispatches, 1);
});

test('block5 schedule runtime: replay conserva run y payload divergente falla cerrado', async () => {
  const { runtime } = endpointDeps();
  const input = {
    workflowKey: 'daily-briefing' as const,
    principalKey: 'daily-briefing' as const,
    scheduledFor: '2026-08-03T10:15:00.000Z',
    contractVersion: 'vida2-automations-v1',
  };
  const first = await runtime.beginScheduledRun({ ...input, payloadDigest: 'a'.repeat(64) });
  const replay = await runtime.beginScheduledRun({ ...input, payloadDigest: 'a'.repeat(64) });
  const conflict = await runtime.beginScheduledRun({ ...input, payloadDigest: 'b'.repeat(64) });
  assert.equal(replay.code, 'replay');
  assert.equal(replay.run?.runKey, first.run?.runKey);
  assert.equal(conflict.code, 'invalid-input');
  assert.equal(conflict.run, null);
});

test('block5 schedule runtime: terminal y timeout liberan el lease del principal', async () => {
  let current = NOW;
  const { runtime } = endpointDeps({ now: () => current });
  const first = await runtime.beginScheduledRun({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    scheduledFor: '2026-08-03T10:15:00.000Z',
    contractVersion: 'vida2-automations-v1',
    payloadDigest: '1'.repeat(64),
  });
  const terminal = await runtime.recordResult({
    runKey: first.run!.runKey,
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    status: 'succeeded',
    resultCode: 'completed',
    summary: 'Completada.',
    proposalKey: null,
    artifact: null,
  });
  assert.equal(terminal.ok, true);
  const second = await runtime.beginScheduledRun({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    scheduledFor: '2026-08-04T10:15:00.000Z',
    contractVersion: 'vida2-automations-v1',
    payloadDigest: '2'.repeat(64),
  });
  assert.equal(second.code, 'accepted');
  current += 90_001;
  const timeout = await runtime.recordResult({
    runKey: second.run!.runKey,
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    status: 'succeeded',
    resultCode: 'completed',
    summary: 'Tardía.',
    proposalKey: null,
    artifact: null,
  });
  assert.equal(timeout.run?.resultCode, 'timed-out');
  const third = await runtime.beginScheduledRun({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    scheduledFor: '2026-08-05T10:15:00.000Z',
    contractVersion: 'vida2-automations-v1',
    payloadDigest: '3'.repeat(64),
  });
  assert.equal(third.code, 'accepted');
});

test('block5 schedule endpoint: HMAC válido resuelve principal y responde solo datos sanitizados', async () => {
  let dispatches = 0;
  const context = endpointDeps({ dispatch: () => dispatches++ });
  const logs: string[] = [];
  const response = await handleScheduledAutomationRequest(signedRequest(), {
    ...context.deps,
    log: (line) => logs.push(line),
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(payload).sort(), [
    'accepted',
    'attempt',
    'contractVersion',
    'ok',
    'principalTrace',
    'replay',
    'runKey',
    'status',
    'workflowKey',
  ]);
  assert.equal(payload.accepted, true);
  assert.equal(dispatches, 0);
  assert.equal(logs.length, 1);
  assert.equal(/daily-key|secret|signature|workflow:|http/i.test(JSON.stringify(payload)), false);
  assert.equal(/daily-key|secret|signature|workflow:|http/i.test(logs[0]!), false);
});

test('block5 schedule endpoint: firma inválida y credenciales parciales o duplicadas fallan cerrado', async () => {
  const context = endpointDeps();
  const invalid = await handleScheduledAutomationRequest(
    signedRequest({ secret: 'not-the-right-secret' }),
    context.deps,
  );
  assert.equal(invalid.status, 401);
  const partial = await handleScheduledAutomationRequest(signedRequest(), {
    ...context.deps,
    env: { ...ENV, OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_SECRET: undefined },
  });
  assert.equal(partial.status, 401);
  const duplicate = await handleScheduledAutomationRequest(signedRequest(), {
    ...context.deps,
    env: {
      ...ENV,
      OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_KEY_ID: 'daily-key',
    },
  });
  assert.equal(duplicate.status, 401);
});

test('block5 schedule endpoint: mismatch, principal client-controlled y campos desconocidos se rechazan', async () => {
  const context = endpointDeps();
  const mismatch = await handleScheduledAutomationRequest(
    signedRequest({ body: scheduleBody('weekly-review'), requestId: 'schedule-mismatch-1' }),
    context.deps,
  );
  assert.equal(mismatch.status, 400);
  const injectedBody = JSON.stringify({
    workflowKey: 'daily-briefing',
    scheduledFor: '2026-08-03T10:15:00.000Z',
    contractVersion: 'vida2-automations-v1',
    principalKey: 'planning-suggestion',
  });
  const injected = await handleScheduledAutomationRequest(
    signedRequest({ body: injectedBody, requestId: 'schedule-injected-1' }),
    context.deps,
  );
  assert.equal(injected.status, 400);
});

test('block5 schedule endpoint: método, query y content-type son exactos', async () => {
  const context = endpointDeps();
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({ method: 'GET', requestId: 'schedule-method-1' }),
        context.deps,
      )
    ).status,
    405,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({ url: `${ENDPOINT_URL}?retry=1`, requestId: 'schedule-query-1' }),
        context.deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({ contentType: 'text/plain', requestId: 'schedule-content-1' }),
        context.deps,
      )
    ).status,
    415,
  );
});

test('block5 schedule endpoint: UTF-8, tamaño, JSON y ocurrencia se validan estrictamente', async () => {
  const context = endpointDeps();
  const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({ body: invalidUtf8, requestId: 'schedule-utf8-1' }),
        context.deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({ body: 'x'.repeat(2_049), requestId: 'schedule-large-1' }),
        context.deps,
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({ body: '{', requestId: 'schedule-json-1' }),
        context.deps,
      )
    ).status,
    400,
  );
  assert.equal(
    isCanonicalScheduledOccurrence('daily-briefing', '2026-08-03T10:15:00.000Z', NOW),
    true,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({
          body: scheduleBody('daily-briefing', '2026-08-03T10:16:00.000Z'),
          requestId: 'schedule-occurrence-1',
        }),
        context.deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(
        signedRequest({
          body: scheduleBody('daily-briefing', '2026-08-02T10:15:00.000Z'),
          requestId: 'schedule-window-1',
        }),
        context.deps,
      )
    ).status,
    400,
  );
});

test('block5 schedule endpoint: replay HMAC y replay de negocio son fronteras distintas', async () => {
  const context = endpointDeps();
  const first = await handleScheduledAutomationRequest(signedRequest(), context.deps);
  const hmacReplay = await handleScheduledAutomationRequest(signedRequest(), context.deps);
  const businessReplay = await handleScheduledAutomationRequest(
    signedRequest({ requestId: 'schedule-request-0002' }),
    context.deps,
  );
  assert.equal(first.status, 200);
  assert.equal(hmacReplay.status, 409);
  assert.equal(businessReplay.status, 200);
  assert.equal((await businessReplay.json()).replay, true);
});

test('block5 schedule endpoint: rate limit se particiona por principal', async () => {
  const context = endpointDeps();
  const rateLimit = {
    async allow(key: string) {
      return key === 'workflow:daily-briefing'
        ? ({ ok: false, reason: 'rate-limited' } as const)
        : ({ ok: true } as const);
    },
  };
  const limited = await handleScheduledAutomationRequest(signedRequest(), {
    ...context.deps,
    rateLimit,
  });
  assert.equal(limited.status, 429);
});

test('block5 schedule endpoint: flags, templates y Production no autorizada permanecen fail-closed', async () => {
  const context = endpointDeps();
  assert.equal(
    (
      await handleScheduledAutomationRequest(signedRequest(), {
        ...context.deps,
        env: { ...ENV, AUTOMATIONS_SCHEDULE_INGRESS_ENABLED: 'false' },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(signedRequest(), {
        ...context.deps,
        env: { ...ENV, AUTOMATIONS_N8N_TEMPLATES_PROVISIONED: 'false' },
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await handleScheduledAutomationRequest(signedRequest(), {
        ...context.deps,
        env: { ...ENV, NODE_ENV: 'production', VERCEL_ENV: 'production' },
      })
    ).status,
    404,
  );
});

test('block5 schedule approval digest: principales distintos no colisionan y ownership es exacto', async () => {
  assert.equal(
    resolveManualAutomationRequest({
      workflowKey: 'approval-digest',
      confirmed: true,
    }),
    null,
  );
  const context = endpointDeps({ now: () => Date.parse('2026-08-03T15:15:00.000Z') });
  const body = scheduleBody('approval-digest', '2026-08-03T15:15:00.000Z');
  const steward = await handleScheduledAutomationRequest(
    signedRequest({
      body,
      keyId: 'approval-steward-key',
      secret: 'approval-steward-secret-with-safe-length',
      requestId: 'approval-steward-1',
      timestamp: Date.parse('2026-08-03T15:15:00.000Z'),
    }),
    context.deps,
  );
  const health = await handleScheduledAutomationRequest(
    signedRequest({
      body,
      keyId: 'approval-health-key',
      secret: 'approval-health-secret-with-safe-length',
      requestId: 'approval-health-1',
      timestamp: Date.parse('2026-08-03T15:15:00.000Z'),
    }),
    context.deps,
  );
  assert.equal(steward.status, 200);
  assert.equal(health.status, 200);
  const stewardPayload = await steward.json();
  const healthPayload = await health.json();
  assert.notEqual(stewardPayload.runKey, healthPayload.runKey);
  const crossed = await context.runtime.recordResult({
    runKey: stewardPayload.runKey,
    workflowKey: 'approval-digest',
    principalKey: 'approval-digest-health',
    status: 'succeeded',
    resultCode: 'completed',
    summary: 'Cruce.',
    proposalKey: null,
    artifact: null,
  });
  assert.equal(crossed.ok, false);
});
