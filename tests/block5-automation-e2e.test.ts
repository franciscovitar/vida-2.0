import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { handleAutomationResultRequest } from '@/lib/automations/callback';
import { listAutomationWorkflowContracts } from '@/lib/automations/contracts';
import { getAutomationsDashboardData } from '@/lib/automations/dashboard';
import { resolveManualAutomationRequest } from '@/lib/automations/manual';
import { AutomationOrchestratorError, createN8nClient } from '@/lib/automations/n8n-client';
import { createAutomationRuntime } from '@/lib/automations/runtime';
import {
  createMemoryAutomationStateStore,
  createUpstashAutomationStateStore,
  type AutomationStoreConfig,
} from '@/lib/automations/store';
import type { AutomationPrincipalKey, AutomationWorkflowKey } from '@/types/automations';

const SECRET = 'callback-secret-with-safe-length';
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
  AUTOMATIONS_N8N_BASE_URL: 'http://localhost:5678',
  AUTOMATIONS_N8N_WEBHOOK_SECRET: SECRET,
  AUTOMATIONS_UPSTASH_REDIS_REST_URL: 'https://automations-only.upstash.io',
  AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN: 'automations-token-with-safe-length',
  AUTOMATIONS_STATE_NAMESPACE: 'vida2:automations:test:vida2-automations-v1',
  AUTOMATIONS_STATE_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: 'daily-key',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: 'daily-secret-with-safe-length',
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

function fakeRedis() {
  const values = new Map<string, string>();
  const sorted = new Map<string, Array<{ score: number; member: string }>>();
  const commands: unknown[][] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    commands.push(command);
    const name = String(command[0]);
    const key = String(command[1]);
    let result: unknown = null;
    if (name === 'SET') {
      if (command.includes('NX') && values.has(key)) result = null;
      else {
        values.set(key, String(command[2]));
        result = 'OK';
      }
    } else if (name === 'GET') result = values.get(key) ?? null;
    else if (name === 'EVAL') {
      const evalKey = String(command[3]);
      const token = String(command[4]);
      if (values.get(evalKey) === token) {
        values.delete(evalKey);
        result = 1;
      } else result = 0;
    } else if (name === 'ZADD') {
      const rows = sorted.get(key) ?? [];
      const member = String(command[3]);
      const next = rows.filter((row) => row.member !== member);
      next.push({ score: Number(command[2]), member });
      sorted.set(key, next);
      result = 1;
    } else if (name === 'ZREVRANGE') {
      result = [...(sorted.get(key) ?? [])]
        .sort((left, right) => right.score - left.score)
        .slice(Number(command[2]), Number(command[3]) + 1)
        .map((row) => row.member);
    } else if (name === 'EXPIRE') result = 1;
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return { commands, fetchImpl };
}

function callbackRequest(
  runKey: string,
  workflowKey: AutomationWorkflowKey,
  principalKey: AutomationPrincipalKey,
  requestId: string,
) {
  const planning = workflowKey === 'planning-suggestion';
  const technical = workflowKey === 'technical-watchdog';
  return new Request('http://localhost/api/automations/v1/runs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vida-request-id': requestId,
      'x-vida-automations-secret': SECRET,
    },
    body: JSON.stringify({
      runKey,
      workflowKey,
      principalKey,
      status: 'succeeded',
      resultCode: planning ? 'proposal-created' : 'completed',
      summary: planning
        ? 'Una propuesta pendiente creada.'
        : technical
          ? 'Alerta degradada sanitizada.'
          : 'Resultado sanitizado disponible.',
      proposalKey: planning ? 'proposal_abcdefghijklmnopqrstuvwx' : null,
      artifact: {
        title: planning
          ? 'Sugerencia de planificación'
          : technical
            ? 'Alerta técnica'
            : 'Resultado del workflow',
        summary: planning
          ? 'Una propuesta para decisión Web.'
          : technical
            ? 'Una señal degradada sin datos crudos.'
            : 'Información acotada procesada.',
        items: [{ label: technical ? 'Señales' : 'Elementos', value: planning ? 'Uno' : 'Tres' }],
      },
    }),
  });
}

test('block5 e2e local: trigger, fake n8n, callback, cifrado, dashboard y replay son secuenciales', async () => {
  const redis = fakeRedis();
  const config: AutomationStoreConfig = {
    url: ENV.AUTOMATIONS_UPSTASH_REDIS_REST_URL,
    token: ENV.AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN,
    namespace: ENV.AUTOMATIONS_STATE_NAMESPACE,
    timeoutMs: 1_000,
    encryptionKey: randomBytes(32),
  };
  const store = createUpstashAutomationStateStore(config, redis.fetchImpl);
  const dispatches: Array<{ workflowKey: AutomationWorkflowKey; requestKey: string }> = [];
  const runtime = createAutomationRuntime({
    env: ENV,
    store,
    orchestrator: {
      trigger: async (input) => {
        const requestKey = `request_fake_${dispatches.length}`;
        dispatches.push({ workflowKey: input.workflowKey, requestKey });
        return { accepted: true, requestKey };
      },
    },
  });

  const principals = listAutomationWorkflowContracts().flatMap((contract) =>
    contract.principalKeys.map((principalKey) => ({
      workflowKey: contract.workflowKey,
      principalKey,
    })),
  );
  let planningRunKey = '';
  for (const [index, principal] of principals.entries()) {
    const started = await runtime.start({
      ...principal,
      trigger: 'scheduled',
      idempotencyKey: `scheduled:2026-08-01:${index}`,
    });
    assert.equal(started.ok, true, `${principal.workflowKey}:${principal.principalKey}`);
    assert.equal(started.run?.status, 'running');
    const runKey = started.run!.runKey;
    const requestId = `callback-e2e-${String(index).padStart(4, '0')}`;
    const callback = await handleAutomationResultRequest(
      callbackRequest(runKey, principal.workflowKey, principal.principalKey, requestId),
      { env: ENV, store, runtime, log: () => undefined },
    );
    assert.equal(callback.status, 200, `${principal.workflowKey}:${principal.principalKey}`);
    const stored = await store.getRun(runKey);
    assert.equal(stored?.status, 'succeeded');
    assert.match(stored?.artifactKey ?? '', /^artifact_/);
    const artifact = await store.getArtifact(stored!.artifactKey!);
    assert.equal(
      artifact?.kind,
      listAutomationWorkflowContracts().find(
        (contract) => contract.workflowKey === principal.workflowKey,
      )?.outputKind,
    );
    if (
      principal.workflowKey === 'daily-briefing' ||
      principal.workflowKey === 'planning-suggestion'
    ) {
      const replay = await handleAutomationResultRequest(
        callbackRequest(runKey, principal.workflowKey, principal.principalKey, requestId),
        { env: ENV, store, runtime, log: () => undefined },
      );
      assert.equal(replay.status, 200);
      assert.equal(((await replay.json()) as { replay: boolean }).replay, true);
    }
    if (principal.workflowKey === 'planning-suggestion') planningRunKey = runKey;
  }

  assert.equal(dispatches.length, 6);
  assert.equal(new Set(dispatches.map((item) => item.requestKey)).size, 6);
  assert.equal(dispatches.filter((item) => item.workflowKey === 'planning-suggestion').length, 1);
  assert.deepEqual(
    new Set(
      (await store.listRuns({ workflowKey: 'approval-digest' })).map((run) => run.principalKey),
    ),
    new Set(['approval-digest-steward', 'approval-digest-health']),
  );
  const dashboard = await getAutomationsDashboardData({ env: ENV, store });
  assert.equal(dashboard.readinessState, 'ready');
  assert.equal(dashboard.recentRuns.length, 6);
  assert.equal(
    dashboard.recentRuns.filter((run) => run.workflowKey === 'planning-suggestion')[0]
      ?.proposalCreated,
    true,
  );
  assert.equal(JSON.stringify(dashboard).includes(planningRunKey), false);

  const captured = JSON.stringify(redis.commands);
  assert.equal(captured.includes(planningRunKey), false);
  assert.equal(captured.includes('Información acotada procesada.'), false);
  assert.equal(captured.includes('Una propuesta para decisión Web.'), false);
});

test('block5 e2e local: watchdog abre, bloquea y recupera el circuit breaker en half-open', async () => {
  let now = Date.parse('2026-08-01T12:00:00.000Z');
  let accept = false;
  const store = createMemoryAutomationStateStore(() => now);
  const runtime = createAutomationRuntime({
    env: ENV,
    store,
    now: () => now,
    sleep: async () => undefined,
    log: () => undefined,
    orchestrator: {
      trigger: async () => {
        if (!accept) throw new AutomationOrchestratorError(400, false, 'orchestrator-rejected');
        return { accepted: true, requestKey: 'request_watchdog_recovery' };
      },
    },
  });
  for (let index = 0; index < 3; index += 1) {
    const failed = await runtime.start({
      workflowKey: 'technical-watchdog',
      principalKey: 'technical-watchdog',
      trigger: 'scheduled',
      idempotencyKey: `watchdog:failure:${index}`,
    });
    assert.equal(failed.code, 'failed');
  }
  assert.equal((await store.getWorkflowControl('technical-watchdog'))?.circuit.mode, 'open');
  assert.equal(
    (
      await runtime.start({
        workflowKey: 'technical-watchdog',
        principalKey: 'technical-watchdog',
        trigger: 'scheduled',
        idempotencyKey: 'watchdog:blocked',
      })
    ).code,
    'paused',
  );

  now += 15 * 60 * 1_000 + 1;
  accept = true;
  const oldReplay = await runtime.start({
    workflowKey: 'technical-watchdog',
    principalKey: 'technical-watchdog',
    trigger: 'scheduled',
    idempotencyKey: 'watchdog:failure:0',
  });
  assert.equal(oldReplay.code, 'replay');
  assert.equal((await store.getWorkflowControl('technical-watchdog'))?.circuit.mode, 'open');
  const recovery = await runtime.start({
    workflowKey: 'technical-watchdog',
    principalKey: 'technical-watchdog',
    trigger: 'scheduled',
    idempotencyKey: 'watchdog:half-open',
  });
  assert.equal(recovery.code, 'accepted');
  const completed = await handleAutomationResultRequest(
    callbackRequest(
      recovery.run!.runKey,
      'technical-watchdog',
      'technical-watchdog',
      'callback-watchdog-recovery',
    ),
    { env: ENV, store, runtime, log: () => undefined },
  );
  assert.equal(completed.status, 200);
  assert.equal((await store.getWorkflowControl('technical-watchdog'))?.circuit.mode, 'closed');
});

test('block5 e2e local: weekly retry conserva negocio, renueva auth y termina por timeout', async () => {
  let now = Date.parse('2026-08-01T12:00:00.000Z');
  const bodies: Array<{
    idempotencyKey: string;
    requestKey: string;
    attempt: number;
    trigger: string;
  }> = [];
  const client = createN8nClient(
    { baseUrl: 'http://localhost:5678', secret: SECRET, timeoutMs: 1_000 },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as (typeof bodies)[number];
      bodies.push(body);
      if (bodies.length < 3) return new Response('{}', { status: 503 });
      return new Response(
        JSON.stringify({ ok: true, accepted: true, requestKey: body.requestKey }),
        { status: 200 },
      );
    },
  );
  const store = createMemoryAutomationStateStore(() => now);
  const runtime = createAutomationRuntime({
    env: ENV,
    store,
    orchestrator: client,
    sleep: async () => undefined,
    now: () => now,
    log: () => undefined,
  });
  const started = await runtime.start({
    workflowKey: 'weekly-review',
    principalKey: 'weekly-review',
    trigger: 'scheduled',
    idempotencyKey: 'weekly:2026-W31',
  });
  assert.equal(started.code, 'accepted');
  assert.deepEqual(
    bodies.map((body) => body.attempt),
    [1, 2, 3],
  );
  assert.equal(new Set(bodies.map((body) => body.requestKey)).size, 3);
  assert.equal(new Set(bodies.map((body) => body.idempotencyKey)).size, 1);
  assert.deepEqual(
    bodies.map((body) => body.trigger),
    ['scheduled', 'retry', 'retry'],
  );
  now += 120_001;
  const completed = await handleAutomationResultRequest(
    callbackRequest(
      started.run!.runKey,
      'weekly-review',
      'weekly-review',
      'callback-weekly-retried',
    ),
    { env: ENV, store, runtime, log: () => undefined },
  );
  assert.equal(completed.status, 409);
  assert.equal((await store.getRun(started.run!.runKey))?.resultCode, 'timed-out');
  assert.equal((await store.getRun(started.run!.runKey))?.artifactKey, null);
  assert.equal((await store.listRuns({ workflowKey: 'weekly-review' })).length, 1);
});

test('block5 e2e local: frontera manual resuelve identidad y respeta pausa solo en servidor', async () => {
  assert.equal(
    resolveManualAutomationRequest({ workflowKey: 'daily-briefing', confirmed: false }),
    null,
  );
  assert.deepEqual(
    resolveManualAutomationRequest({ workflowKey: 'daily-briefing', confirmed: true }),
    { workflowKey: 'daily-briefing', principalKey: 'daily-briefing' },
  );
  assert.equal(
    resolveManualAutomationRequest({ workflowKey: 'approval-digest', confirmed: true }),
    null,
  );
  const forgedClientInput = {
    workflowKey: 'daily-briefing',
    confirmed: true,
    principalKey: 'technical-watchdog',
  };
  assert.deepEqual(resolveManualAutomationRequest(forgedClientInput), {
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
  });

  const store = createMemoryAutomationStateStore();
  const runtime = createAutomationRuntime({
    env: ENV,
    store,
    log: () => undefined,
    orchestrator: {
      trigger: async () => ({ accepted: true, requestKey: 'request_manual_paused' }),
    },
  });
  await runtime.setPaused('daily-briefing', true);
  const paused = await runtime.start({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    trigger: 'manual',
    idempotencyKey: 'manual:paused-boundary',
    confirmed: true,
  });
  assert.equal(paused.code, 'paused');
});
