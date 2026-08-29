/**
 * Block 3F — flag off: zero I/O (coordination never called).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { createMemoryAuditSink } from '@/lib/actions/audit';
import type { WriteCoordinationPort } from '@/lib/actions/coordination';
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
import type { ActionResult } from '@/types/actions';

function countingCoordination(): WriteCoordinationPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async reserveIdempotency() {
      calls.push('reserveIdempotency');
      return { status: 'reserved' };
    },
    async getIdempotentResult() {
      calls.push('getIdempotentResult');
      return null;
    },
    async acquireProposalLease() {
      calls.push('acquireProposalLease');
      return { status: 'unavailable' };
    },
    async releaseProposalLease() {
      calls.push('releaseProposalLease');
    },
    async markFinal() {
      calls.push('markFinal');
    },
  };
}

test('B3F-01. WRITE_ACTIONS_ENABLED false → coordination not called', async () => {
  const coordination = countingCoordination();
  const encryptionKey = randomBytes(32);
  const tasks = createMemoryTaskPort({
    areaProjectMap: { 'proj-salud': 'area.salud' },
  });
  const result: ActionResult = await executeAction(
    requestFromEmail('user@example.com', {
      actionType: 'task.create',
      idempotencyKey: 'flag-off-1',
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'web', targetDate: '2026-07-28' },
      payload: {
        title: 'Should not write',
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
      writesEnabled: false,
      idempotency: createMemoryIdempotencyStore(),
      audit: createMemoryAuditSink(),
      coordination,
      handlers: {
        tasks,
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

  assert.equal(result.code, 'flag-disabled');
  assert.equal(coordination.calls.length, 0);
  assert.equal(tasks.tasks.size, 0);
});
