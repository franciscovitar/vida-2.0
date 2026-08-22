/**
 * Block 3H — privacy: auditLooksSafe positives and negatives.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditLooksSafe } from '@/lib/actions/audit';
import type { ActionAuditRecord } from '@/types/actions';

function base(partial: Partial<ActionAuditRecord> = {}): ActionAuditRecord {
  return {
    actionType: 'proposal.create',
    actorHint: 'us***@example.com',
    at: '2026-07-28T12:00:00.000Z',
    resultCode: 'applied',
    confirmationMode: 'explicit',
    idempotencyKey: 'k1',
    errorCode: null,
    targetKey: 'prop-abc',
    verified: true,
    ...partial,
  };
}

test('B3H-01. clean audit record looks safe', () => {
  assert.equal(auditLooksSafe(base()), true);
});

test('B3H-02. rejects secrets, URLs, journaling', () => {
  assert.equal(auditLooksSafe(base({ afterSummary: 'Bearer tok' })), false);
  assert.equal(auditLooksSafe(base({ beforeSummary: 'secret_abc' })), false);
  assert.equal(auditLooksSafe(base({ afterSummary: 'https://notion.so/page' })), false);
  assert.equal(auditLooksSafe(base({ actionType: 'journaling.read' })), false);
  assert.equal(auditLooksSafe(base({ afterSummary: '-----BEGIN PRIVATE KEY-----' })), false);
});
