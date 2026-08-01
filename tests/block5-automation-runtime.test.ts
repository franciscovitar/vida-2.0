import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { AutomationOrchestratorError, createN8nClient } from '@/lib/automations/n8n-client';
import { createAutomationRuntime } from '@/lib/automations/runtime';
import { createMemoryAutomationStateStore } from '@/lib/automations/store';

const BASE_ENV = {
  NODE_ENV: 'test',
  AUTOMATIONS_API_ENABLED: 'true',
  AUTOMATIONS_ACCESS_MODE: 'read-only',
  AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
  AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
  AUTOMATIONS_MANUAL_RUN_ENABLED: 'true',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: 'daily-key',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: 'daily-secret-with-safe-length',
} as const;

test('block5 runtime: global/workflow/manual disabled y principal incorrecto fallan cerrados', async () => {
  const store = createMemoryAutomationStateStore();
  const orchestrator = {
    trigger: async () => ({ accepted: true as const, requestKey: 'request_safe' }),
  };
  const disabled = createAutomationRuntime({ store, orchestrator, env: {} });
  assert.equal(
    (
      await disabled.start({
        workflowKey: 'daily-briefing',
        principalKey: 'daily-briefing',
        trigger: 'manual',
        idempotencyKey: 'manual:disabled',
        confirmed: true,
      })
    ).code,
    'disabled',
  );
  const manualOff = createAutomationRuntime({
    store,
    orchestrator,
    env: { ...BASE_ENV, AUTOMATIONS_MANUAL_RUN_ENABLED: 'false' },
  });
  assert.equal(
    (
      await manualOff.start({
        workflowKey: 'daily-briefing',
        principalKey: 'daily-briefing',
        trigger: 'manual',
        idempotencyKey: 'manual:off',
        confirmed: true,
      })
    ).code,
    'disabled',
  );
  const wrongPrincipal = createAutomationRuntime({ store, orchestrator, env: BASE_ENV });
  assert.equal(
    (
      await wrongPrincipal.start({
        workflowKey: 'daily-briefing',
        principalKey: 'weekly-review',
        trigger: 'manual',
        idempotencyKey: 'manual:wrong',
        confirmed: true,
      })
    ).code,
    'invalid-input',
  );
});

test('block5 runtime: idempotencia, concurrencia y reintentos conservan una ejecución', async () => {
  const store = createMemoryAutomationStateStore();
  let calls = 0;
  const runtime = createAutomationRuntime({
    store,
    env: BASE_ENV,
    sleep: async () => undefined,
    orchestrator: {
      async trigger() {
        calls += 1;
        if (calls < 3) throw new AutomationOrchestratorError(503, true, 'orchestrator-rejected');
        return { accepted: true, requestKey: `request_${calls}` };
      },
    },
  });
  const first = await runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'manual',
    idempotencyKey: 'manual:same-request',
    confirmed: true,
  });
  assert.equal(first.code, 'accepted');
  assert.equal(first.run?.attempt, 3);
  assert.equal(calls, 3);
  const replay = await runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'manual',
    idempotencyKey: 'manual:same-request',
    confirmed: true,
  });
  assert.equal(replay.code, 'replay');
  assert.equal(replay.run?.runKey, first.run?.runKey);
  const concurrent = await runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'manual',
    idempotencyKey: 'manual:other-request',
    confirmed: true,
  });
  assert.equal(concurrent.code, 'busy');
  assert.equal((await store.listRuns()).length, 2);
});

test('block5 runtime: circuit breaker abre al tercer fallo y pausa el siguiente intento', async () => {
  const store = createMemoryAutomationStateStore();
  const runtime = createAutomationRuntime({
    store,
    env: BASE_ENV,
    sleep: async () => undefined,
    orchestrator: {
      trigger: async () => {
        throw new AutomationOrchestratorError(400, false, 'orchestrator-rejected');
      },
    },
  });
  for (let index = 0; index < 3; index += 1) {
    const result = await runtime.start({
      workflowKey: 'daily-briefing',
      principalKey: 'daily-briefing',
      trigger: 'manual',
      idempotencyKey: `manual:failure-${index}`,
      confirmed: true,
    });
    assert.equal(result.code, 'failed');
  }
  const control = await store.getWorkflowControl('daily-briefing');
  assert.equal(control?.circuit.mode, 'open');
  assert.equal(control?.circuit.consecutiveFailures, 3);
  const paused = await runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'manual',
    idempotencyKey: 'manual:blocked-by-circuit',
    confirmed: true,
  });
  assert.equal(paused.code, 'paused');
});

test('block5 runtime: un callback tardío cierra la ejecución por timeout', async () => {
  let now = Date.parse('2026-08-01T12:00:00.000Z');
  const store = createMemoryAutomationStateStore(() => now);
  const runtime = createAutomationRuntime({
    store,
    env: BASE_ENV,
    now: () => now,
    orchestrator: {
      trigger: async () => ({ accepted: true, requestKey: 'request_timeout' }),
    },
  });
  const started = await runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'scheduled',
    idempotencyKey: 'scheduled:timeout-window',
  });
  now += 90_001;
  const late = await runtime.recordResult({
    runKey: started.run!.runKey,
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    status: 'succeeded',
    resultCode: 'completed',
    summary: 'Resultado tardío.',
    proposalKey: null,
    artifact: null,
  });
  assert.equal(late.ok, false);
  assert.equal(late.run?.status, 'failed');
  assert.equal(late.run?.resultCode, 'timed-out');
});

test('block5 runtime: proposal-only es obligatorio y una propuesta no puede duplicarse', async () => {
  const planningEnv = {
    ...BASE_ENV,
    AUTOMATIONS_PLANNING_SUGGESTION_ENABLED: 'true',
    OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_KEY_ID: 'planning-key',
    OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_SECRET: 'planning-secret-with-safe-length',
  };
  const readOnly = createAutomationRuntime({
    store: createMemoryAutomationStateStore(),
    env: planningEnv,
    orchestrator: { trigger: async () => ({ accepted: true, requestKey: 'request_readonly' }) },
  });
  assert.equal(
    (
      await readOnly.start({
        workflowKey: 'planning-suggestion',
        principalKey: 'planning-suggestion',
        trigger: 'manual',
        idempotencyKey: 'manual:planning-readonly',
        confirmed: true,
      })
    ).code,
    'disabled',
  );

  const store = createMemoryAutomationStateStore();
  const runtime = createAutomationRuntime({
    store,
    env: { ...planningEnv, AUTOMATIONS_ACCESS_MODE: 'proposal-only' },
    orchestrator: { trigger: async () => ({ accepted: true, requestKey: 'request_planning' }) },
  });
  const started = await runtime.start({
    workflowKey: 'planning-suggestion',
    principalKey: 'planning-suggestion',
    trigger: 'manual',
    idempotencyKey: 'manual:planning-proposal',
    confirmed: true,
  });
  assert.equal(started.ok, true);
  const completed = await runtime.recordResult({
    runKey: started.run!.runKey,
    workflowKey: 'planning-suggestion',
    principalKey: 'planning-suggestion',
    status: 'succeeded',
    resultCode: 'proposal-created',
    summary: 'Propuesta pendiente creada.',
    proposalKey: 'proposal_safe_12345678',
    artifact: { title: 'Plan sugerido', summary: 'Una propuesta pendiente.', items: [] },
  });
  assert.equal(completed.ok, true);
  const duplicate = await runtime.recordResult({
    runKey: started.run!.runKey,
    workflowKey: 'planning-suggestion',
    principalKey: 'planning-suggestion',
    status: 'succeeded',
    resultCode: 'proposal-created',
    summary: 'Otra propuesta.',
    proposalKey: 'proposal_other_12345678',
    artifact: null,
  });
  assert.equal(duplicate.ok, false);
});

test('block5 n8n: allowlist, body mínimo, respuesta estricta y secreto fuera del body', async () => {
  let capturedBody = '';
  let capturedSecret = '';
  const client = createN8nClient(
    { baseUrl: 'http://localhost:5678', secret: 'orchestrator-secret-safe-value', timeoutMs: 100 },
    async (_url, init) => {
      capturedBody = String(init?.body);
      capturedSecret = new Headers(init?.headers).get('x-vida-automations-secret') ?? '';
      const requestKey = (JSON.parse(capturedBody) as { requestKey: string }).requestKey;
      return new Response(JSON.stringify({ ok: true, accepted: true, requestKey }), {
        status: 200,
      });
    },
  );
  const result = await client.trigger({
    runKey: 'run_abcdefghijklmnopqrstuvwx',
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    idempotencyKey: 'manual:n8n-test',
    attempt: 1,
    trigger: 'manual',
  });
  assert.equal(result.accepted, true);
  assert.equal(capturedSecret, 'orchestrator-secret-safe-value');
  assert.equal(capturedBody.includes('orchestrator-secret-safe-value'), false);
  assert.equal(/email|token|provider|journal/i.test(capturedBody), false);
});

test('block5 runtime: no contiene caminos de approve, reject, execute o rollback', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/automations/runtime.ts'), 'utf8');
  assert.equal(
    /proposal\.approve|proposal\.reject|action\.rollback|direct-write/.test(source),
    false,
  );
});
