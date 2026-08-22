/**
 * Block 3G — audit: intention before write; applied-audit-pending; no secrets.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { auditLooksSafe, createMemoryAuditSink, type AuditSink } from '@/lib/actions/audit';
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
import type { ActionAuditRecord } from '@/types/actions';

function failingFinalizeAudit(): AuditSink & { rows: ActionAuditRecord[] } {
  const rows: ActionAuditRecord[] = [];
  return {
    rows,
    async append(record) {
      rows.push(record);
      if (record.sagaPhase === 'finalized' || record.sagaPhase === 'verified') {
        return { ok: false, message: 'audit-sink-unavailable' };
      }
      if (record.resultCode !== 'in-progress' && record.sagaPhase !== 'intention') {
        // Intention uses in-progress; allow it. Fail other final-like appends without phase.
        if (record.resultCode === 'applied') {
          return { ok: false, message: 'audit-sink-unavailable' };
        }
      }
      return { ok: true };
    },
    async list() {
      return rows;
    },
  };
}

test('B3G-01. intention recorded before successful write', async () => {
  const audit = createMemoryAuditSink();
  const coordination = createMemoryWriteCoordination();
  const encryptionKey = randomBytes(32);
  await executeAction(
    requestFromEmail('alice@example.com', {
      actionType: 'inbox.capture',
      idempotencyKey: 'b3g-intention',
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'web', targetDate: '2026-07-28' },
      payload: {
        text: 'audit order',
        link: null,
        capturedAt: '2026-07-28T12:00:00.000Z',
        origin: 'web',
      },
    }),
    {
      writesEnabled: true,
      idempotency: createMemoryIdempotencyStore(),
      audit,
      coordination,
      handlers: {
        tasks: createMemoryTaskPort(),
        inbox: createMemoryInboxPort(),
        gym: createMemoryGymPort(),
        proposals: createMemoryProposalPort(),
        calendar: createMemoryCalendarHoldPort(),
        encryptionStore: createMemoryEncryptedPayloadStore(),
        encryptionKey,
        coordination,
      },
    },
  );
  const rows = await audit.list();
  assert.ok(rows.length >= 2);
  const intentionIdx = rows.findIndex((r) => r.sagaPhase === 'intention');
  const finalizeIdx = rows.findIndex((r) => r.sagaPhase === 'finalized');
  assert.ok(intentionIdx >= 0);
  assert.ok(finalizeIdx > intentionIdx);
  assert.equal(rows[intentionIdx]!.resultCode, 'in-progress');
});

test('B3G-02. applied-audit-pending when finalize audit fails', async () => {
  const audit = failingFinalizeAudit();
  const coordination = createMemoryWriteCoordination();
  const encryptionKey = randomBytes(32);
  const result = await executeAction(
    requestFromEmail('bob@example.com', {
      actionType: 'inbox.capture',
      idempotencyKey: 'b3g-pending',
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'web', targetDate: '2026-07-28' },
      payload: {
        text: 'write ok audit fail',
        link: null,
        capturedAt: '2026-07-28T12:00:00.000Z',
        origin: 'web',
      },
    }),
    {
      writesEnabled: true,
      idempotency: createMemoryIdempotencyStore(),
      audit,
      coordination,
      handlers: {
        tasks: createMemoryTaskPort(),
        inbox: createMemoryInboxPort(),
        gym: createMemoryGymPort(),
        proposals: createMemoryProposalPort(),
        calendar: createMemoryCalendarHoldPort(),
        encryptionStore: createMemoryEncryptedPayloadStore(),
        encryptionKey,
        coordination,
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, 'applied-audit-pending');
});

test('B3G-03. audit records exclude emails/ids/secrets', async () => {
  const audit = createMemoryAuditSink();
  const coordination = createMemoryWriteCoordination();
  const encryptionKey = randomBytes(32);
  await executeAction(
    requestFromEmail('secret.user@example.com', {
      actionType: 'task.create',
      idempotencyKey: 'b3g-safe',
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'web', targetDate: '2026-07-28' },
      payload: {
        title: 'Safe audit',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    {
      writesEnabled: true,
      idempotency: createMemoryIdempotencyStore(),
      audit,
      coordination,
      handlers: {
        tasks: createMemoryTaskPort({
          areaProjectMap: { 'proj-salud': 'area.salud' },
        }),
        inbox: createMemoryInboxPort(),
        gym: createMemoryGymPort(),
        proposals: createMemoryProposalPort(),
        calendar: createMemoryCalendarHoldPort(),
        encryptionStore: createMemoryEncryptedPayloadStore(),
        encryptionKey,
        coordination,
      },
    },
  );
  const rows = await audit.list();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(auditLooksSafe(row), true);
    const json = JSON.stringify(row);
    assert.equal(json.includes('secret.user@example.com'), false);
    assert.equal(json.includes('Bearer '), false);
    assert.equal(json.includes('secret_'), false);
    assert.equal(json.includes('notion.so'), false);
  }
});
