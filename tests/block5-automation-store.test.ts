import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import {
  buildAutomationStateStore,
  createMemoryAutomationStateStore,
  createOpaqueAutomationKey,
  createUpstashAutomationStateStore,
  resolveAutomationStoreConfig,
  type AutomationStoreConfig,
} from '@/lib/automations/store';
import type { AutomationRunRecord } from '@/types/automations';

function runRecord(runKey = createOpaqueAutomationKey('run')): AutomationRunRecord {
  return {
    runKey,
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    principalId: 'workflow:daily-briefing',
    trigger: 'manual',
    status: 'running',
    attempt: 1,
    idempotencyKey: 'manual:test-request',
    startedAt: '2026-08-01T12:00:00.000Z',
    finishedAt: null,
    durationMs: null,
    resultCode: null,
    summary: 'Resumen sanitizado',
    proposalKey: null,
    artifactKey: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    expiresAt: '2026-08-03T12:00:00.000Z',
  };
}

function fakeUpstash() {
  const values = new Map<string, string>();
  const sorted = new Map<string, string[]>();
  const commands: unknown[][] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    commands.push(command);
    const [name, key, value] = command as [string, string, string];
    let result: unknown = null;
    if (name === 'SET') {
      if (command.includes('NX') && values.has(key)) result = null;
      else {
        values.set(key, value);
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
    } else if (name === 'DEL') {
      values.delete(key);
      result = 1;
    } else if (name === 'ZADD') {
      const member = String(command[3]);
      const list = sorted.get(key) ?? [];
      if (!list.includes(member)) list.push(member);
      sorted.set(key, list);
      result = 1;
    } else if (name === 'ZREVRANGE') result = [...(sorted.get(key) ?? [])].reverse();
    else if (name === 'EXPIRE') result = 1;
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return { values, commands, fetchImpl };
}

test('block5 store: memory aplica replay, TTL, leases y claves opacas', async () => {
  let now = 1_000;
  const store = createMemoryAutomationStateStore(() => now);
  const run = runRecord();
  assert.match(run.runKey, /^run_[A-Za-z0-9_-]{20,80}$/);
  assert.match(createOpaqueAutomationKey('artifact'), /^artifact_[A-Za-z0-9_-]{20,80}$/);
  assert.deepEqual(
    await store.reserveIdempotency({
      workflowKey: run.workflowKey,
      idempotencyKey: run.idempotencyKey,
      runKey: run.runKey,
      ttlSeconds: 2,
    }),
    { status: 'reserved' },
  );
  assert.deepEqual(
    await store.reserveIdempotency({
      workflowKey: run.workflowKey,
      idempotencyKey: run.idempotencyKey,
      runKey: createOpaqueAutomationKey('run'),
      ttlSeconds: 2,
    }),
    { status: 'replay', runKey: run.runKey },
  );
  const lease = await store.acquireWorkflowLease(run.workflowKey, 2);
  assert.equal(lease.status, 'acquired');
  assert.deepEqual(await store.acquireWorkflowLease(run.workflowKey, 2), { status: 'busy' });
  await store.putRun(run, 2);
  assert.deepEqual(await store.getRun(run.runKey), run);
  now += 2_001;
  assert.equal(await store.getRun(run.runKey), null);
});

test('block5 store: configuración real falla cerrada y nunca cae a memoria', () => {
  assert.equal(buildAutomationStateStore({}), null);
  assert.deepEqual(resolveAutomationStoreConfig({}), { ok: false, reason: 'missing-store' });
  assert.equal(
    resolveAutomationStoreConfig({
      AUTOMATIONS_UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN: 'token-with-safe-length',
      AUTOMATIONS_STATE_NAMESPACE: 'vida2:automations:test:v1',
      AUTOMATIONS_STATE_ENCRYPTION_KEY: 'wrong',
    }).ok,
    false,
  );
  const shared = {
    AUTOMATIONS_UPSTASH_REDIS_REST_URL: 'https://shared.upstash.io',
    AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN: 'shared-token-with-safe-length',
    AUTOMATIONS_STATE_NAMESPACE: 'vida2:automations:test:v1',
    AUTOMATIONS_STATE_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    UPSTASH_REDIS_REST_URL: 'https://shared.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'shared-token-with-safe-length',
  };
  assert.deepEqual(resolveAutomationStoreConfig(shared), {
    ok: false,
    reason: 'invalid-store',
  });
});

test('block5 store: Upstash recibe ciphertext y ningún plaintext sensible', async () => {
  const fake = fakeUpstash();
  const config: AutomationStoreConfig = {
    url: 'https://safe-name.upstash.io',
    token: 'token-with-safe-length',
    namespace: 'vida2:automations:test:vida2-automations-v1',
    timeoutMs: 1_000,
    encryptionKey: randomBytes(32),
  };
  const store = createUpstashAutomationStateStore(config, fake.fetchImpl);
  const run = { ...runRecord(), summary: 'private-marker user@example.com' };
  await store.putRun(run, 60);
  assert.deepEqual(await store.getRun(run.runKey), run);
  assert.deepEqual(await store.listRuns({ workflowKey: run.workflowKey, limit: 1 }), [run]);
  const captured = JSON.stringify(fake.commands);
  assert.equal(captured.includes('private-marker'), false);
  assert.equal(captured.includes('user@example.com'), false);
  assert.equal(captured.includes(run.principalId), false);
  assert.equal(captured.includes(run.idempotencyKey), false);
  assert.equal(captured.includes(run.runKey), false);
  const encryptedSet = fake.commands.find(
    (command) => command[0] === 'SET' && String(command[1]).includes(':run:'),
  )!;
  assert.deepEqual(Object.keys(JSON.parse(String(encryptedSet[2])) as object).sort(), [
    'ciphertext',
    'nonce',
    'tag',
    'v',
  ]);
  assert.equal(encryptedSet.includes('EX'), true);
  assert.equal(Number(encryptedSet.at(-1)) > 0, true);

  const wrongKey = createUpstashAutomationStateStore(
    { ...config, encryptionKey: randomBytes(32) },
    fake.fetchImpl,
  );
  assert.equal(await wrongKey.getRun(run.runKey), null);
  const storedKey = [...fake.values.keys()].find((key) => key.includes(':run:'))!;
  fake.values.set(storedKey, `${fake.values.get(storedKey)}tampered`);
  assert.equal(await store.getRun(run.runKey), null);
  fake.values.set(storedKey, JSON.stringify(run));
  assert.equal(await store.getRun(run.runKey), null);
  fake.values.set(storedKey, 'x'.repeat(40 * 1024 + 1));
  await assert.rejects(store.getRun(run.runKey), /upstash-unavailable/);
});

test('block5 store: leases son first-wins y compare-and-delete no libera otro owner', async () => {
  const fake = fakeUpstash();
  const config: AutomationStoreConfig = {
    url: 'https://safe-name.upstash.io',
    token: 'token-with-safe-length',
    namespace: 'vida2:automations:test:vida2-automations-v1',
    timeoutMs: 1_000,
    encryptionKey: randomBytes(32),
  };
  const store = createUpstashAutomationStateStore(config, fake.fetchImpl);
  const [first, second] = await Promise.all([
    store.acquireWorkflowLease('daily-briefing', 30),
    store.acquireWorkflowLease('daily-briefing', 30),
  ]);
  assert.equal([first.status, second.status].filter((status) => status === 'acquired').length, 1);
  const acquired = first.status === 'acquired' ? first : second;
  assert.equal(acquired.status, 'acquired');
  if (acquired.status !== 'acquired') return;
  await store.releaseWorkflowLease('daily-briefing', 'wrong-owner-token');
  assert.equal((await store.acquireWorkflowLease('daily-briefing', 30)).status, 'busy');
  await store.releaseWorkflowLease('daily-briefing', acquired.token);
  assert.equal((await store.acquireWorkflowLease('daily-briefing', 30)).status, 'acquired');

  const runKey = createOpaqueAutomationKey('run');
  const [runFirst, runSecond] = await Promise.all([
    store.acquireRunLease(runKey, 30),
    store.acquireRunLease(runKey, 30),
  ]);
  assert.equal(
    [runFirst.status, runSecond.status].filter((status) => status === 'acquired').length,
    1,
  );
  assert.equal(JSON.stringify(fake.commands).includes(runKey), false);
});

test('block5 store: artefactos excedidos y formas inválidas se rechazan', async () => {
  const store = createMemoryAutomationStateStore();
  await assert.rejects(
    store.putArtifact(
      {
        artifactKey: createOpaqueAutomationKey('artifact'),
        runKey: createOpaqueAutomationKey('run'),
        workflowKey: 'daily-briefing',
        principalKey: 'daily-briefing',
        kind: 'briefing',
        title: 'x'.repeat(121),
        summary: 'Resumen',
        items: [],
        proposalKey: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      60,
    ),
    /automation-artifact-invalid/,
  );
});

test('block5 store: listado aplica offset y límite máximo de 50', async () => {
  const store = createMemoryAutomationStateStore();
  for (let index = 0; index < 55; index += 1) {
    await store.putRun(
      {
        ...runRecord(),
        runKey: createOpaqueAutomationKey('run'),
        idempotencyKey: `manual:pagination:${index}`,
        createdAt: new Date(Date.parse('2026-08-01T12:00:00.000Z') + index).toISOString(),
      },
      60,
    );
  }
  assert.equal((await store.listRuns({ limit: 500 })).length, 50);
  assert.equal((await store.listRuns({ limit: 10, offset: 50 })).length, 5);
});
