import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleAutomationResultRequest } from '@/lib/automations/callback';
import { createAutomationRuntime } from '@/lib/automations/runtime';
import { createMemoryAutomationStateStore } from '@/lib/automations/store';

const SECRET = 'callback-secret-with-enough-length';
const ENV = {
  NODE_ENV: 'test',
  AUTOMATIONS_API_ENABLED: 'true',
  AUTOMATIONS_ACCESS_MODE: 'read-only',
  AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
  AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
  AUTOMATIONS_RESULT_CALLBACK_ENABLED: 'true',
  AUTOMATIONS_N8N_BASE_URL: 'http://localhost:5678',
  AUTOMATIONS_N8N_WEBHOOK_SECRET: SECRET,
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: 'daily-key',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: 'daily-secret-with-safe-length',
} as const;

function request(
  body: unknown,
  input: { secret?: string; requestId?: string; url?: string; method?: string } = {},
) {
  return new Request(input.url ?? 'http://localhost/api/automations/v1/runs', {
    method: input.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vida-request-id': input.requestId ?? 'callback-request-0001',
      'x-vida-automations-secret': input.secret ?? SECRET,
    },
    body: JSON.stringify(body),
  });
}

async function fixture() {
  const store = createMemoryAutomationStateStore();
  const runtime = createAutomationRuntime({
    store,
    env: ENV,
    orchestrator: {
      trigger: async () => ({ accepted: true, requestKey: 'request_callback_fixture' }),
    },
  });
  const started = await runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'scheduled',
    idempotencyKey: 'scheduled:2026-08-01T07:15',
  });
  assert.equal(started.ok, true);
  return { store, runtime, runKey: started.run!.runKey };
}

function validBody(runKey: string) {
  return {
    runKey,
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    status: 'succeeded',
    resultCode: 'completed',
    summary: 'Briefing sanitizado disponible.',
    proposalKey: null,
    artifact: {
      title: 'Briefing diario',
      summary: 'Cinco elementos priorizados.',
      items: [{ label: 'Pendientes', value: 'Cinco' }],
    },
  };
}

test('block5 callback: autentica, persiste cifrado y responde envelope acotado', async () => {
  const { store, runtime, runKey } = await fixture();
  const logs: string[] = [];
  const result = await handleAutomationResultRequest(request(validBody(runKey)), {
    env: ENV,
    store,
    runtime,
    log: (line) => logs.push(line),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, runKey, status: 'succeeded', replay: false });
  const stored = await store.getRun(runKey);
  assert.equal(stored?.status, 'succeeded');
  assert.match(stored?.artifactKey ?? '', /^artifact_/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.includes(runKey), false);
  assert.equal(logs[0]?.includes(SECRET), false);
});

test('block5 callback: auth, query, método, campos y texto sensible fallan cerrados', async () => {
  const { store, runtime, runKey } = await fixture();
  const deps = { env: ENV, store, runtime };
  assert.equal(
    (
      await handleAutomationResultRequest(
        request(validBody(runKey), { secret: 'wrong-secret-with-enough-length' }),
        deps,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleAutomationResultRequest(
        request(validBody(runKey), { url: 'http://localhost/api/automations/v1/runs?debug=1' }),
        deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (await handleAutomationResultRequest(request(validBody(runKey), { method: 'PUT' }), deps))
      .status,
    405,
  );
  assert.equal(
    (
      await handleAutomationResultRequest(
        request({ ...validBody(runKey), payload: { approve: true } }),
        deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleAutomationResultRequest(
        request({ ...validBody(runKey), summary: 'Enviar a user@example.com' }),
        deps,
      )
    ).status,
    400,
  );
});

test('block5 callback: tamaño, replay y transición inválida están controlados', async () => {
  const { store, runtime, runKey } = await fixture();
  const deps = { env: ENV, store, runtime };
  const oversized = validBody(runKey);
  oversized.artifact.summary = 'x'.repeat(17 * 1024);
  assert.equal(
    (
      await handleAutomationResultRequest(
        request(oversized, { requestId: 'callback-request-size' }),
        deps,
      )
    ).status,
    413,
  );

  const first = await handleAutomationResultRequest(
    request(validBody(runKey), { requestId: 'callback-request-replay' }),
    deps,
  );
  assert.equal(first.status, 200);
  const replay = await handleAutomationResultRequest(
    request(validBody(runKey), { requestId: 'callback-request-replay' }),
    deps,
  );
  assert.equal(replay.status, 200);
  assert.equal(((await replay.json()) as { replay: boolean }).replay, true);
  const invalidTransition = await handleAutomationResultRequest(
    request(
      { ...validBody(runKey), status: 'failed', resultCode: 'invalid-result' },
      { requestId: 'callback-request-transition' },
    ),
    deps,
  );
  assert.equal(invalidTransition.status, 409);
});

test('block5 callback: nace apagado y no construye runtime', async () => {
  const result = await handleAutomationResultRequest(
    request(validBody('run_abcdefghijklmnopqrstuvwx')),
    { env: {} },
  );
  assert.equal(result.status, 404);
});

test('block5 callback: cancelled es terminal y no admite instrucciones', async () => {
  const { store, runtime, runKey } = await fixture();
  const body = {
    ...validBody(runKey),
    status: 'cancelled',
    resultCode: 'cancelled',
    summary: 'Ejecución cancelada sin efectos.',
    artifact: null,
  };
  const result = await handleAutomationResultRequest(
    request(body, { requestId: 'callback-request-cancelled' }),
    { env: ENV, store, runtime, log: () => undefined },
  );
  assert.equal(result.status, 200);
  assert.equal((await store.getRun(runKey))?.status, 'cancelled');
});
