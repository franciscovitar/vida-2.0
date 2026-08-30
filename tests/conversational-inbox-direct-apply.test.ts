import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryAuditSink } from '@/lib/actions/audit';
import { createMemoryWriteCoordination } from '@/lib/actions/coordination';
import { executeAction } from '@/lib/actions/engine';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import { createMemoryInboxPort, createMemoryProposalPort } from '@/lib/actions/memory-ports';
import { requestFromEmail } from '@/lib/actions/request';
import { buildWriteRuntime } from '@/lib/actions/runtime';
import {
  executeConversationalInboxDirectApply,
  type ConversationalInboxDirectInput,
} from '@/lib/capture/direct-inbox';
import type { ProposalRepositoryPort } from '@/lib/actions/ports';

const enabledEnv = {
  NODE_ENV: 'test',
  WRITE_ACTIONS_ENABLED: 'true',
  WRITE_ACTIONS_USE_MEMORY: 'true',
  CONVERSATIONAL_INBOX_DIRECT_APPLY_ENABLED: 'true',
} as const;

const fixedNow = () => '2030-08-30T15:00:00.000Z';

function baseInput(
  overrides: Partial<ConversationalInboxDirectInput> = {},
): ConversationalInboxDirectInput {
  return {
    channel: 'chatgpt',
    principalId: 'chatgpt-user-1',
    sourceEventId: 'msg-001',
    userIntent: 'explicit-write',
    text: 'Comprar filtro para el agua',
    link: null,
    ...overrides,
  };
}

function makeRuntime(proposalsOverride?: ProposalRepositoryPort) {
  const inbox = createMemoryInboxPort();
  const proposals = proposalsOverride ?? createMemoryProposalPort();
  const audit = createMemoryAuditSink();
  const coordination = createMemoryWriteCoordination();
  const idempotency = createMemoryIdempotencyStore();
  const runtime = buildWriteRuntime(enabledEnv, {
    inbox,
    proposals,
    audit,
    coordination,
    idempotency,
    now: fixedNow,
  });
  return { runtime, inbox, proposals, audit, coordination, idempotency };
}

test('CID1. direct apply is blocked unless the user intent is explicit', async () => {
  const d = makeRuntime();
  const result = await executeConversationalInboxDirectApply(
    baseInput({ userIntent: 'not-explicit' }),
    { env: enabledEnv, runtime: d.runtime, now: fixedNow },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'policy-denied');
  assert.equal(d.inbox.captures.size, 0);
});

test('CID2. only ChatGPT is enabled in the first direct-apply slice', async () => {
  const d = makeRuntime();
  const result = await executeConversationalInboxDirectApply(baseInput({ channel: 'telegram' }), {
    env: enabledEnv,
    runtime: d.runtime,
    now: fixedNow,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'policy-denied');
  assert.equal(d.inbox.captures.size, 0);
});

test('CID3. explicit ChatGPT capture writes once and leaves reversible sanitized ledger', async () => {
  const d = makeRuntime();
  const result = await executeConversationalInboxDirectApply(baseInput(), {
    env: enabledEnv,
    runtime: d.runtime,
    now: fixedNow,
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.code, 'applied');
  assert.equal(result.verified, true);
  assert.equal(d.inbox.captures.size, 1);

  const capture = [...d.inbox.captures.values()][0];
  assert.equal(capture.text, 'Comprar filtro para el agua');
  assert.equal(capture.origin, 'chatgpt');
  assert.equal(capture.capturedAt, fixedNow());

  const rows = await d.proposals.list();
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.status, 'applied');
  assert.equal(row.actionType, 'inbox.capture');
  assert.equal(row.source, 'conversation-direct:chatgpt');
  assert.ok(row.targetKey);
  assert.ok(row.ownershipDigest);
  assert.ok(row.rollbackDeadline);
  assert.deepEqual(
    row.diff?.fields.map((field) => field.field),
    ['contentPresent', 'origin', 'hasLink'],
  );

  const serializedLedger = JSON.stringify(rows);
  assert.equal(serializedLedger.includes('Comprar filtro para el agua'), false);
  const serializedAudit = JSON.stringify(await d.audit.list());
  assert.equal(serializedAudit.includes('Comprar filtro para el agua'), false);
});

test('CID4. replay of the same transport event never duplicates the capture', async () => {
  const d = makeRuntime();
  const first = await executeConversationalInboxDirectApply(baseInput(), {
    env: enabledEnv,
    runtime: d.runtime,
    now: fixedNow,
  });
  const second = await executeConversationalInboxDirectApply(baseInput(), {
    env: enabledEnv,
    runtime: d.runtime,
    now: fixedNow,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.code, 'idempotent-replay');
  assert.equal(second.replay, true);
  assert.equal(d.inbox.captures.size, 1);
  assert.equal((await d.proposals.list()).length, 1);
});

test('CID5. same transport event with different content fails closed', async () => {
  const d = makeRuntime();
  const first = await executeConversationalInboxDirectApply(baseInput(), {
    env: enabledEnv,
    runtime: d.runtime,
    now: fixedNow,
  });
  const conflict = await executeConversationalInboxDirectApply(
    baseInput({ text: 'Contenido distinto para el mismo evento' }),
    { env: enabledEnv, runtime: d.runtime, now: fixedNow },
  );

  assert.equal(first.ok, true);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'conflict');
  assert.equal(d.inbox.captures.size, 1);
});

test('CID6. standard Safe Writes rollback can revert a direct ChatGPT capture', async () => {
  const d = makeRuntime();
  const created = await executeConversationalInboxDirectApply(baseInput(), {
    env: enabledEnv,
    runtime: d.runtime,
    now: fixedNow,
  });
  assert.equal(created.ok, true);

  const rows = await d.proposals.list();
  assert.equal(rows.length, 1);
  const proposalKey = rows[0].key;

  const rolled = await executeAction(
    requestFromEmail('user@example.com', {
      actionType: 'action.rollback',
      payload: { proposalKey },
      idempotencyKey: 'cid-rollback-1',
      confirmation: { mode: 'reinforced', acknowledged: true, phrase: 'revertir' },
      expectedPrevious: null,
      context: { source: 'web', targetDate: null },
    }),
    {
      writesEnabled: true,
      idempotency: d.runtime.idempotency,
      audit: d.runtime.audit,
      handlers: d.runtime.handlers,
      coordination: d.runtime.coordination ?? undefined,
    },
  );

  assert.equal(rolled.ok, true, rolled.message);
  assert.equal(rolled.code, 'rolled-back');
  const remaining = [...d.inbox.captures.values()].filter((capture) => !capture.archived);
  assert.equal(remaining.length, 0);
  assert.equal((await d.proposals.get(proposalKey))?.status, 'rolled-back');
});

test('CID7. if ledger cannot certify applied, the write is compensated immediately', async () => {
  const backing = createMemoryProposalPort();
  const proposals: ProposalRepositoryPort = {
    create: (payload, meta) => backing.create(payload, meta),
    get: (key) => backing.get(key),
    list: (status) => backing.list(status),
    updateStatus: (key, status, patch, options) => {
      if (status === 'applied') return Promise.resolve(null);
      return backing.updateStatus(key, status, patch, options);
    },
  };
  const d = makeRuntime(proposals);

  const result = await executeConversationalInboxDirectApply(baseInput(), {
    env: enabledEnv,
    runtime: d.runtime,
    now: fixedNow,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'failed');
  const remaining = [...d.inbox.captures.values()].filter((capture) => !capture.archived);
  assert.equal(remaining.length, 0);
  const rows = await backing.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'failed');
});
