/**
 * Block 3C — proposal flow: create→diff→approve→applied; reject; expire; double; missing payload.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { createMemoryAuditSink } from '@/lib/actions/audit';
import { createMemoryWriteCoordination } from '@/lib/actions/coordination';
import { createMemoryEncryptedPayloadStore } from '@/lib/actions/encryption';
import { executeAction } from '@/lib/actions/engine';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import {
  createMemoryCalendarHoldPort,
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import { requestFromEmail } from '@/lib/actions/request';
import type { ActionConfirmation, ActionRequest } from '@/types/actions';

const explicit: ActionConfirmation = { mode: 'explicit', acknowledged: true, phrase: null };
const approveConfirm: ActionConfirmation = {
  mode: 'reinforced',
  acknowledged: true,
  phrase: 'aprobar',
};

function deps(overrides?: {
  proposals?: ReturnType<typeof createMemoryProposalPort>;
  inbox?: ReturnType<typeof createMemoryInboxPort>;
  encryptionStore?: ReturnType<typeof createMemoryEncryptedPayloadStore>;
  now?: () => string;
}) {
  const encryptionKey = randomBytes(32);
  const encryptionStore = overrides?.encryptionStore ?? createMemoryEncryptedPayloadStore();
  const coordination = createMemoryWriteCoordination();
  return {
    writesEnabled: true,
    idempotency: createMemoryIdempotencyStore(),
    audit: createMemoryAuditSink(),
    coordination,
    handlers: {
      tasks: createMemoryTaskPort({
        areaProjectMap: { 'proj-salud': 'area.salud' },
      }),
      inbox: overrides?.inbox ?? createMemoryInboxPort(),
      gym: createMemoryGymPort(),
      proposals: overrides?.proposals ?? createMemoryProposalPort(),
      calendar: createMemoryCalendarHoldPort(),
      encryptionStore,
      encryptionKey,
      coordination,
      approvalTtlSeconds: 86_400,
      rollbackWindowSeconds: 604_800,
      now: overrides?.now ?? (() => '2026-07-28T12:00:00.000Z'),
    },
  };
}

function request(
  partial: Partial<ActionRequest> &
    Pick<ActionRequest, 'actionType' | 'payload' | 'idempotencyKey'>,
): ActionRequest {
  return requestFromEmail('user@example.com', {
    confirmation: explicit,
    expectedPrevious: null,
    context: { source: 'web', targetDate: '2026-07-28' },
    ...partial,
  });
}

const inboxProposalPayload = {
  name: 'Captura',
  proposedActionType: 'inbox.capture' as const,
  targetType: 'inbox' as const,
  targetKey: null,
  reason: 'r',
  expectedChange: 'c',
  risk: 'low' as const,
  reversible: true,
  payload: {
    text: 'nota propuesta',
    link: null,
    capturedAt: '2026-07-28T12:00:00.000Z',
    origin: 'web',
  },
};

test('B3C-01. create → diff → approve → applied', async () => {
  const proposals = createMemoryProposalPort();
  const inbox = createMemoryInboxPort();
  const d = deps({ proposals, inbox });
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'b3c-create',
      payload: inboxProposalPayload,
    }),
    d,
  );
  assert.equal(created.ok, true);
  const key = created.target?.key;
  assert.ok(key);
  const pending = await proposals.get(key!);
  assert.equal(pending?.status, 'pending');
  assert.ok(pending?.diff);
  assert.ok(pending?.encryptedPayloadKey);
  assert.ok(pending?.payloadDigest);

  const approved = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: 'b3c-approve',
      confirmation: approveConfirm,
      payload: { proposalKey: key },
    }),
    d,
  );
  assert.equal(approved.ok, true);
  assert.equal((await proposals.get(key!))?.status, 'applied');
  assert.equal(inbox.captures.size, 1);
});

test('B3C-02. reject', async () => {
  const proposals = createMemoryProposalPort();
  const d = deps({ proposals });
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'b3c-rej-c',
      payload: inboxProposalPayload,
    }),
    d,
  );
  assert.ok(created.target?.key);
  const key = created.target.key;
  const rejected = await executeAction(
    request({
      actionType: 'proposal.reject',
      idempotencyKey: 'b3c-rej',
      payload: { proposalKey: key },
    }),
    d,
  );
  assert.equal(rejected.ok, true);
  assert.equal((await proposals.get(key))?.status, 'rejected');
});

test('B3C-03. expire on decide after TTL', async () => {
  let now = '2026-07-28T12:00:00.000Z';
  const proposals = createMemoryProposalPort();
  const d = deps({ proposals, now: () => now });
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'b3c-exp-c',
      payload: inboxProposalPayload,
    }),
    d,
  );
  assert.ok(created.target?.key);
  const key = created.target.key;
  now = '2026-07-30T13:00:00.000Z';
  const decided = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: 'b3c-exp-a',
      confirmation: approveConfirm,
      payload: { proposalKey: key },
    }),
    d,
  );
  assert.equal(decided.code, 'expired');
  assert.equal((await proposals.get(key))?.status, 'expired');
});

test('B3C-04. double decision conflicts', async () => {
  const proposals = createMemoryProposalPort();
  const d = deps({ proposals });
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'b3c-dbl-c',
      payload: inboxProposalPayload,
    }),
    d,
  );
  assert.ok(created.target?.key);
  const key = created.target.key;
  const first = await executeAction(
    request({
      actionType: 'proposal.reject',
      idempotencyKey: 'b3c-dbl-1',
      payload: { proposalKey: key },
    }),
    d,
  );
  assert.equal(first.ok, true);
  const second = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: 'b3c-dbl-2',
      confirmation: approveConfirm,
      payload: { proposalKey: key },
    }),
    d,
  );
  assert.equal(second.code, 'conflict');
});

test('B3C-05. missing ciphertext on approve', async () => {
  const proposals = createMemoryProposalPort();
  const encryptionStore = createMemoryEncryptedPayloadStore();
  const d = deps({ proposals, encryptionStore });
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'b3c-miss-c',
      payload: inboxProposalPayload,
    }),
    d,
  );
  assert.ok(created.target?.key);
  const key = created.target.key;
  const row = await proposals.get(key);
  assert.ok(row);
  assert.ok(row.encryptedPayloadKey);
  await encryptionStore.delete(row.encryptedPayloadKey);
  const approved = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: 'b3c-miss-a',
      confirmation: approveConfirm,
      payload: { proposalKey: key },
    }),
    d,
  );
  assert.equal(approved.ok, false);
  assert.ok(approved.code === 'expired' || approved.code === 'misconfigured');
});
