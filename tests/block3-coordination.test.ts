/**
 * Block 3B — coordination: reserve/replay/digest/leases (memory + fake EVAL).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMemoryWriteCoordination,
  createUpstashWriteCoordination,
  type WriteCoordinationConfig,
  type WriteRedisFetch,
} from '@/lib/actions/coordination';
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
} {
  const store = new Map<string, string>();

  const fetchImpl: WriteRedisFetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '[]')) as unknown[];
    const cmd = String(body[0] ?? '').toUpperCase();

    if (cmd === 'EVAL') {
      const script = String(body[1] ?? '');
      const keyCount = Number(body[2] ?? 0);
      const keys = body.slice(3, 3 + keyCount).map(String);
      const args = body.slice(3 + keyCount).map(String);

      if (script.includes("state='reserved'") || script.includes("state='reserved'")) {
        const key = keys[0]!;
        const digest = args[0]!;
        const existing = store.get(key);
        if (!existing) {
          store.set(key, JSON.stringify({ state: 'reserved', digest }));
          return jsonResponse(JSON.stringify({ status: 'reserved' }));
        }
        const parsed = JSON.parse(existing) as {
          state: string;
          digest?: string;
          result?: ActionResult;
        };
        if (parsed.state === 'final' && parsed.result) {
          return jsonResponse(JSON.stringify({ status: 'replay', result: parsed.result }));
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

      if (script.includes("state='final'") || script.includes("state='final'")) {
        const key = keys[0]!;
        const digest = args[0]!;
        const result = JSON.parse(args[1]!) as ActionResult;
        store.set(key, JSON.stringify({ state: 'final', digest, result }));
        return jsonResponse('OK');
      }

      throw new Error('unknown script');
    }

    if (cmd === 'GET') {
      return jsonResponse(store.get(String(body[1])) ?? null);
    }
    if (cmd === 'DEL') {
      store.delete(String(body[1]));
      return jsonResponse(1);
    }
    throw new Error(`unsupported ${cmd}`);
  };

  return { fetchImpl, store };
}

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('B3B-05. fake EVAL Upstash reserve/replay + dual lease', async () => {
  const { fetchImpl } = createFakeEvalFetch();
  const config: WriteCoordinationConfig = {
    url: 'https://example.upstash.io',
    token: 'token-with-enough-length',
    namespace: 'vida2:writes:test:vida2-writes-v1',
    timeoutMs: 3000,
  };
  const c = createUpstashWriteCoordination(config, fetchImpl);

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
