/**
 * Block 3B — coordination: reserve/replay/digest/leases (memory + fake EVAL).
 * Upstash: ActionResult cifrado; sin plaintext en transporte.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import {
  createMemoryWriteCoordination,
  createUpstashWriteCoordination,
  parseDecryptedActionResult,
  type WriteCoordinationConfig,
  type WriteRedisFetch,
} from '@/lib/actions/coordination';
import { decryptProposalPayload, encryptProposalPayload } from '@/lib/actions/encryption';
import { executeAction } from '@/lib/actions/engine';
import { createMemoryAuditSink } from '@/lib/actions/audit';
import { createMemoryCalendarHoldPort } from '@/lib/actions/calendar-hold';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import {
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import type { ActionResult } from '@/types/actions';

const sampleResult = (code: ActionResult['code'] = 'applied'): ActionResult => ({
  ok: code === 'applied',
  code,
  message: 'ok',
  idempotencyKey: 'k',
  actionType: 'proposal.create',
  target: { type: 'proposal', key: 'p1' },
  summary: 's',
  verified: true,
});

function testEncryptionKey(): Buffer {
  return createHash('sha256').update('vida2-test-idempotency-encryption-key').digest();
}

test('B3B-01. memory reserve then replay after markFinal', async () => {
  const c = createMemoryWriteCoordination();
  const reserved = await c.reserveIdempotency({
    actorHash: 'a1',
    actionType: 'proposal.create',
    idempotencyKey: 'id-1',
    payloadDigest: 'digest-a',
    ttlSeconds: 60,
  });
  assert.equal(reserved.status, 'reserved');
  await c.markFinal({
    actorHash: 'a1',
    actionType: 'proposal.create',
    idempotencyKey: 'id-1',
    payloadDigest: 'digest-a',
    result: sampleResult(),
    ttlSeconds: 60,
  });
  const again = await c.reserveIdempotency({
    actorHash: 'a1',
    actionType: 'proposal.create',
    idempotencyKey: 'id-1',
    payloadDigest: 'digest-a',
    ttlSeconds: 60,
  });
  assert.equal(again.status, 'replay');
  if (again.status === 'replay') assert.equal(again.result.code, 'applied');
});

test('B3B-02. memory digest conflict', async () => {
  const c = createMemoryWriteCoordination();
  await c.reserveIdempotency({
    actorHash: 'a1',
    actionType: 'task.create',
    idempotencyKey: 'same',
    payloadDigest: 'd1',
    ttlSeconds: 60,
  });
  const conflict = await c.reserveIdempotency({
    actorHash: 'a1',
    actionType: 'task.create',
    idempotencyKey: 'same',
    payloadDigest: 'd2',
    ttlSeconds: 60,
  });
  assert.deepEqual(conflict, { status: 'conflict', reason: 'digest-mismatch' });
});

test('B3B-03. concurrent lease same purpose conflicts', async () => {
  const c = createMemoryWriteCoordination();
  const first = await c.acquireProposalLease({
    proposalKey: 'p-lease',
    purpose: 'approve',
    ttlSeconds: 60,
  });
  assert.equal(first.status, 'acquired');
  const second = await c.acquireProposalLease({
    proposalKey: 'p-lease',
    purpose: 'approve',
    ttlSeconds: 60,
  });
  assert.equal(second.status, 'conflict');
});

test('B3B-04. dual approve/rollback prevention', async () => {
  const c = createMemoryWriteCoordination();
  const approve = await c.acquireProposalLease({
    proposalKey: 'p-dual',
    purpose: 'approve',
    ttlSeconds: 60,
  });
  assert.equal(approve.status, 'acquired');
  const rollback = await c.acquireProposalLease({
    proposalKey: 'p-dual',
    purpose: 'rollback',
    ttlSeconds: 60,
  });
  assert.equal(rollback.status, 'conflict');
});

function createFakeEvalFetch(): {
  fetchImpl: WriteRedisFetch;
  store: Map<string, string>;
  captured: string[];
} {
  const store = new Map<string, string>();
  const captured: string[] = [];

  const fetchImpl: WriteRedisFetch = async (_url, init) => {
    const bodyText = String(init?.body ?? '[]');
    captured.push(bodyText);
    const body = JSON.parse(bodyText) as unknown[];
    const cmd = String(body[0] ?? '').toUpperCase();

    if (cmd === 'EVAL') {
      const script = String(body[1] ?? '');
      const keyCount = Number(body[2] ?? 0);
      const keys = body.slice(3, 3 + keyCount).map(String);
      const args = body.slice(3 + keyCount).map(String);
      captured.push(script, ...keys, ...args);

      if (script.includes("state='reserved'")) {
        const key = keys[0]!;
        const digest = args[0]!;
        const ttl = Number(args[1] ?? 0);
        assert.ok(ttl > 0);
        const existing = store.get(key);
        if (!existing) {
          store.set(key, JSON.stringify({ state: 'reserved', digest }));
          return jsonResponse(JSON.stringify({ status: 'reserved' }));
        }
        const parsed = JSON.parse(existing) as {
          state: string;
          digest?: string;
          result?: ActionResult;
          resultEncrypted?: unknown;
        };
        if (parsed.state === 'final' && parsed.resultEncrypted) {
          return jsonResponse(
            JSON.stringify({ status: 'replay', resultEncrypted: parsed.resultEncrypted }),
          );
        }
        if (parsed.state === 'final') {
          return jsonResponse(JSON.stringify({ status: 'conflict', reason: 'final' }));
        }
        if (parsed.digest !== digest) {
          return jsonResponse(JSON.stringify({ status: 'conflict', reason: 'digest-mismatch' }));
        }
        return jsonResponse(JSON.stringify({ status: 'conflict', reason: 'in-progress' }));
      }

      if (script.includes('sibling') || script.includes('EXISTS')) {
        const key = keys[0]!;
        const sibling = keys[1]!;
        const token = args[0]!;
        if (store.has(sibling)) {
          return jsonResponse(JSON.stringify({ status: 'conflict' }));
        }
        const current = store.get(key);
        if (current && current !== token) {
          return jsonResponse(JSON.stringify({ status: 'conflict' }));
        }
        store.set(key, token);
        return jsonResponse(JSON.stringify({ status: 'acquired', token }));
      }

      if (script.includes('resultEncrypted')) {
        const key = keys[0]!;
        const digest = args[0]!;
        const envelope = JSON.parse(args[1]!) as unknown;
        const ttl = Number(args[2] ?? 0);
        assert.ok(ttl > 0);
        store.set(key, JSON.stringify({ state: 'final', digest, resultEncrypted: envelope }));
        return jsonResponse('OK');
      }

      throw new Error('unknown script');
    }

    if (cmd === 'GET') {
      captured.push(String(body[1] ?? ''));
      return jsonResponse(store.get(String(body[1])) ?? null);
    }
    if (cmd === 'DEL') {
      store.delete(String(body[1]));
      return jsonResponse(1);
    }
    throw new Error(`unsupported ${cmd}`);
  };

  return { fetchImpl, store, captured };
}

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UPSTASH_CONFIG: WriteCoordinationConfig = {
  url: 'https://example.upstash.io',
  token: 'token-with-enough-length',
  namespace: 'vida2:writes:test:vida2-writes-v1',
  timeoutMs: 3000,
};

test('B3B-05. fake EVAL Upstash reserve/replay cifrado + dual lease', async () => {
  const { fetchImpl } = createFakeEvalFetch();
  const key = testEncryptionKey();
  const c = createUpstashWriteCoordination(UPSTASH_CONFIG, key, fetchImpl);

  const reserved = await c.reserveIdempotency({
    actorHash: 'actor',
    actionType: 'proposal.approve',
    idempotencyKey: 'u-1',
    payloadDigest: 'pd',
    ttlSeconds: 60,
  });
  assert.equal(reserved.status, 'reserved');

  await c.markFinal({
    actorHash: 'actor',
    actionType: 'proposal.approve',
    idempotencyKey: 'u-1',
    payloadDigest: 'pd',
    result: sampleResult(),
    ttlSeconds: 60,
  });

  const replay = await c.reserveIdempotency({
    actorHash: 'actor',
    actionType: 'proposal.approve',
    idempotencyKey: 'u-1',
    payloadDigest: 'pd',
    ttlSeconds: 60,
  });
  assert.equal(replay.status, 'replay');
  if (replay.status === 'replay') {
    assert.equal(replay.result.code, 'applied');
    assert.equal(replay.result.idempotencyKey, 'k');
  }

  const leaseA = await c.acquireProposalLease({
    proposalKey: 'up-lease',
    purpose: 'approve',
    ttlSeconds: 60,
  });
  assert.equal(leaseA.status, 'acquired');
  const leaseB = await c.acquireProposalLease({
    proposalKey: 'up-lease',
    purpose: 'rollback',
    ttlSeconds: 60,
  });
  assert.equal(leaseB.status, 'conflict');
});

test('B3B-06. markFinal no envía plaintext sensible a Upstash', async () => {
  const { fetchImpl, store, captured } = createFakeEvalFetch();
  const key = testEncryptionKey();
  const c = createUpstashWriteCoordination(UPSTASH_CONFIG, key, fetchImpl);

  const sentinels = {
    idempotencyKey: `idemp-sentinel-${randomBytes(8).toString('hex')}`,
    targetKey: `target-internal-${randomBytes(8).toString('hex')}`,
    summary: `summary-fixture-${randomBytes(8).toString('hex')}`,
    message: `message-fixture-${randomBytes(8).toString('hex')}`,
  };

  const result: ActionResult = {
    ok: true,
    code: 'applied',
    message: sentinels.message,
    idempotencyKey: sentinels.idempotencyKey,
    actionType: 'inbox.capture',
    target: { type: 'inbox', key: sentinels.targetKey },
    summary: sentinels.summary,
    verified: true,
  };

  await c.reserveIdempotency({
    actorHash: 'actor-hash-opaque',
    actionType: 'inbox.capture',
    idempotencyKey: sentinels.idempotencyKey,
    payloadDigest: 'digest-opaque',
    ttlSeconds: 120,
  });
  await c.markFinal({
    actorHash: 'actor-hash-opaque',
    actionType: 'inbox.capture',
    idempotencyKey: sentinels.idempotencyKey,
    payloadDigest: 'digest-opaque',
    result,
    ttlSeconds: 120,
  });

  const blob = [...captured, ...store.keys(), ...store.values()].join('\n');
  for (const sentinel of Object.values(sentinels)) {
    assert.equal(blob.includes(sentinel), false, sentinel);
  }

  const stored = [...store.values()].find((value) => value.includes('resultEncrypted'));
  assert.ok(stored);
  const parsed = JSON.parse(stored!) as {
    state: string;
    digest: string;
    resultEncrypted: { v: number; nonce: string; ciphertext: string; tag: string };
    result?: unknown;
  };
  assert.equal(parsed.state, 'final');
  assert.equal(parsed.digest, 'digest-opaque');
  assert.equal('result' in parsed, false);
  assert.equal(parsed.resultEncrypted.v, 1);
  assert.ok(parsed.resultEncrypted.nonce.length > 0);
  assert.ok(parsed.resultEncrypted.ciphertext.length > 0);
  assert.ok(parsed.resultEncrypted.tag.length > 0);

  const redisKey = [...store.keys()].find((item) => item.includes(':idemp:'));
  assert.ok(redisKey);
  assert.match(redisKey!, /^vida2:writes:test:vida2-writes-v1:idemp:[a-f0-9]+$/);
  assert.equal(redisKey!.includes(sentinels.idempotencyKey), false);
});

test('B3B-07. replay descifrado exacto y getIdempotentResult sin envelope', async () => {
  const { fetchImpl } = createFakeEvalFetch();
  const key = testEncryptionKey();
  const c = createUpstashWriteCoordination(UPSTASH_CONFIG, key, fetchImpl);

  const original: ActionResult = {
    ok: true,
    code: 'applied',
    message: 'Sesión propuesta',
    idempotencyKey: 'replay-exact-1',
    actionType: 'gym.session.create',
    target: { type: 'gym-session', key: 'gym-opaque-1' },
    summary: '1 set',
    verified: true,
  };

  await c.reserveIdempotency({
    actorHash: 'ah',
    actionType: 'gym.session.create',
    idempotencyKey: 'replay-exact-1',
    payloadDigest: 'pd-1',
    ttlSeconds: 60,
  });
  await c.markFinal({
    actorHash: 'ah',
    actionType: 'gym.session.create',
    idempotencyKey: 'replay-exact-1',
    payloadDigest: 'pd-1',
    result: original,
    ttlSeconds: 60,
  });

  const replay = await c.reserveIdempotency({
    actorHash: 'ah',
    actionType: 'gym.session.create',
    idempotencyKey: 'replay-exact-1',
    payloadDigest: 'pd-1',
    ttlSeconds: 60,
  });
  assert.equal(replay.status, 'replay');
  if (replay.status === 'replay') {
    assert.deepEqual(replay.result, original);
  }

  const got = await c.getIdempotentResult({
    actorHash: 'ah',
    actionType: 'gym.session.create',
    idempotencyKey: 'replay-exact-1',
  });
  assert.deepEqual(got, original);
  assert.equal(got && 'nonce' in got, false);
  assert.equal(got && 'ciphertext' in got, false);
});

test('B3B-08. motor convierte replay cifrado en idempotent-replay sin reejecutar', async () => {
  const { fetchImpl } = createFakeEvalFetch();
  const key = testEncryptionKey();
  const coordination = createUpstashWriteCoordination(UPSTASH_CONFIG, key, fetchImpl);

  let handlerCalls = 0;
  const baseInbox = createMemoryInboxPort();
  const inbox = {
    ...baseInbox,
    async appendCapture(
      ...args: Parameters<typeof baseInbox.appendCapture>
    ): ReturnType<typeof baseInbox.appendCapture> {
      handlerCalls += 1;
      return baseInbox.appendCapture(...args);
    },
  };

  const deps = {
    writesEnabled: true as const,
    idempotency: createMemoryIdempotencyStore(),
    audit: createMemoryAuditSink(),
    coordination,
    handlers: {
      tasks: createMemoryTaskPort({ authorizedAreas: ['area.salud'] }),
      inbox,
      gym: createMemoryGymPort(),
      proposals: createMemoryProposalPort(),
      calendar: createMemoryCalendarHoldPort(),
    },
  };

  const request = {
    actionType: 'inbox.capture' as const,
    actorHash: 'actor-replay',
    actorHint: 'agent:steward',
    payload: {
      text: 'captura replay',
      link: null,
      capturedAt: '2027-08-01T12:00:00.000Z',
      origin: 'openclaw' as const,
    },
    idempotencyKey: 'engine-replay-1',
    confirmation: { mode: 'explicit' as const, acknowledged: true, phrase: null },
    expectedPrevious: null,
    context: { source: 'openclaw' as const, targetDate: null },
  };

  const first = await executeAction(request, deps);
  assert.equal(first.ok, true);
  assert.equal(first.code, 'applied');
  assert.equal(handlerCalls, 1);

  const second = await executeAction(request, deps);
  assert.equal(second.code, 'idempotent-replay');
  assert.equal(handlerCalls, 1);
});

test('B3B-09. fail-closed ante tampering, clave incorrecta y legado plaintext', async () => {
  const { fetchImpl, store } = createFakeEvalFetch();
  const key = testEncryptionKey();
  const c = createUpstashWriteCoordination(UPSTASH_CONFIG, key, fetchImpl);

  await c.reserveIdempotency({
    actorHash: 'ah',
    actionType: 'task.create',
    idempotencyKey: 'tamper-1',
    payloadDigest: 'pd',
    ttlSeconds: 60,
  });
  await c.markFinal({
    actorHash: 'ah',
    actionType: 'task.create',
    idempotencyKey: 'tamper-1',
    payloadDigest: 'pd',
    result: sampleResult(),
    ttlSeconds: 60,
  });

  const redisKey = [...store.keys()].find((item) => item.includes(':idemp:'))!;
  const good = JSON.parse(store.get(redisKey)!) as {
    state: string;
    digest: string;
    resultEncrypted: { v: number; nonce: string; ciphertext: string; tag: string };
  };

  // Ciphertext alterado.
  store.set(
    redisKey,
    JSON.stringify({
      ...good,
      resultEncrypted: {
        ...good.resultEncrypted,
        ciphertext: Buffer.from('tampered-ciphertext-value!!').toString('base64'),
      },
    }),
  );
  assert.deepEqual(
    await c.reserveIdempotency({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
      payloadDigest: 'pd',
      ttlSeconds: 60,
    }),
    { status: 'conflict', reason: 'final' },
  );
  assert.equal(
    await c.getIdempotentResult({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
    }),
    null,
  );

  // Tag alterado.
  store.set(
    redisKey,
    JSON.stringify({
      ...good,
      resultEncrypted: {
        ...good.resultEncrypted,
        tag: Buffer.alloc(16, 7).toString('base64'),
      },
    }),
  );
  assert.equal(
    await c.getIdempotentResult({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
    }),
    null,
  );

  // Nonce inválido.
  store.set(
    redisKey,
    JSON.stringify({
      ...good,
      resultEncrypted: { ...good.resultEncrypted, nonce: '!!!' },
    }),
  );
  assert.equal(
    await c.getIdempotentResult({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
    }),
    null,
  );

  // Envelope sobredimensionado.
  store.set(
    redisKey,
    JSON.stringify({
      ...good,
      resultEncrypted: {
        ...good.resultEncrypted,
        ciphertext: 'A'.repeat(60_000),
      },
    }),
  );
  assert.equal(
    await c.getIdempotentResult({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
    }),
    null,
  );

  // Clave incorrecta.
  store.set(redisKey, JSON.stringify(good));
  const wrongKey = createUpstashWriteCoordination(UPSTASH_CONFIG, randomBytes(32), fetchImpl);
  assert.equal(
    await wrongKey.getIdempotentResult({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
    }),
    null,
  );

  // JSON descifrado inválido / shape inválida.
  const badPlain = encryptProposalPayload(key, JSON.stringify({ ok: true, unexpected: true }));
  store.set(redisKey, JSON.stringify({ state: 'final', digest: 'pd', resultEncrypted: badPlain }));
  assert.equal(
    await c.getIdempotentResult({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
    }),
    null,
  );

  // Legado plaintext.
  store.set(
    redisKey,
    JSON.stringify({
      state: 'final',
      digest: 'pd',
      result: sampleResult(),
    }),
  );
  assert.deepEqual(
    await c.reserveIdempotency({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
      payloadDigest: 'pd',
      ttlSeconds: 60,
    }),
    { status: 'conflict', reason: 'final' },
  );
  assert.equal(
    await c.getIdempotentResult({
      actorHash: 'ah',
      actionType: 'task.create',
      idempotencyKey: 'tamper-1',
    }),
    null,
  );

  assert.equal(parseDecryptedActionResult({ ok: true }), null);
  assert.ok(
    parseDecryptedActionResult({
      ok: true,
      code: 'applied',
      message: 'ok',
      idempotencyKey: 'k',
      actionType: 'proposal.create',
      target: null,
      summary: null,
      verified: true,
    }),
  );
});

test('B3B-10. decryptProposalPayload sigue autenticando GCM', () => {
  const key = testEncryptionKey();
  const envelope = encryptProposalPayload(key, JSON.stringify(sampleResult()));
  const plain = decryptProposalPayload(key, envelope);
  assert.equal(JSON.parse(plain).code, 'applied');
  assert.throws(() =>
    decryptProposalPayload(key, {
      ...envelope,
      tag: Buffer.alloc(16, 9).toString('base64'),
    }),
  );
});
