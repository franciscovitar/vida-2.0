/**
 * OFFLINE protocol composition ONLY. There is intentionally no Google writer,
 * route handler, live provider adapter, process.env read or exported UI API.
 *
 * Ports MUST be synthetic until a separately reviewed authenticated server
 * boundary proves candidate provenance/consent, exact DEV workbook, canonical
 * SHA identity, durable sole-writer ledger and provider failure behavior.
 * A completed request or HTTP 200 is NOT evidence a row was stored.
 */
import { createHash } from 'node:crypto';

import {
  validPlanningV2LedgerRecord,
  type PlanningV2LedgerRecord,
  type PlanningV2LedgerStatus,
} from '@/lib/daily-planning/dispatch-ledger-v2';
import {
  reconcilePlanningV2Readback,
  type PlanningV2ReconcileKind,
  type PlanningV2ReconcileResult,
} from '@/lib/daily-planning/write-reconciliation-v2';

export interface PlanningV2SyntheticPorts {
  /** Must be an atomic, durable, non-expiring single-authority transition. */
  transition: (
    action: 'prepare' | 'dispatch',
    record: PlanningV2LedgerRecord,
  ) => Promise<PlanningV2LedgerStatus>;
  /** Must be an authoritative, complete, authenticated DEV full-tab inspection. */
  inspect: () => Promise<PlanningV2ReconcileResult>;
  /** One non-retrying provider attempt; NOT implemented here. */
  sendOnce: () => Promise<void>;
}

export interface PlanningV2ProtocolResult {
  status: 'blocked' | 'already-visible' | 'confirmed' | 'uncertain' | 'duplicate' | 'conflict';
  sendAttempts: 0 | 1;
  retryAllowed: false;
}

function result(
  status: PlanningV2ProtocolResult['status'],
  sendAttempts: 0 | 1 = 0,
): PlanningV2ProtocolResult {
  // Deliberately no row content, identity, token, response body or provider log.
  return { status, sendAttempts, retryAllowed: false };
}

async function inspectSafe(
  port: PlanningV2SyntheticPorts['inspect'],
): Promise<PlanningV2ReconcileResult | null> {
  try {
    const response = await port();
    if (!response || response.retryAllowed !== false) return null;
    return response;
  } catch {
    return null;
  }
}

/**
 * Synthetic end-to-end decision protocol with explicit, injected ports.
 * Never call this with real providers until an independent DEV write approval
 * and full caller/data/authentication guards exist. This is NOT a safe live API.
 */
export async function simulatePlanningV2DispatchProtocol(input: {
  kind: PlanningV2ReconcileKind;
  candidateRow: readonly unknown[];
}, ports: PlanningV2SyntheticPorts): Promise<PlanningV2ProtocolResult> {
  const preflight = reconcilePlanningV2Readback({
    kind: input.kind,
    candidateRow: input.candidateRow,
    rows: null,
    readStatus: 'error',
    readComplete: false,
  });
  if (preflight.status !== 'unavailable') return result('blocked');

  // The local digest binds the full candidate bytes; the caller must never
  // supply its own unchecked payloadDigest. Timestamp/key-order differences
  // intentionally conflict until canonical cross-language parity is proven.
  const record: PlanningV2LedgerRecord = {
    kind: input.kind,
    recordId: input.candidateRow[0] as string,
    payloadDigest: createHash('sha256')
      .update(JSON.stringify([input.kind, input.candidateRow]))
      .digest('hex'),
  };
  if (!validPlanningV2LedgerRecord(record)) return result('blocked');

  // Before touching the durable ledger, refuse any incomplete or ambiguous
  // store. A clean no-match is necessary, but alone NOT sufficient to resend.
  const before = await inspectSafe(ports.inspect);
  if (!before) return result('blocked');
  if (before.status === 'confirmed' && before.matchedRows === 1) {
    return result('already-visible');
  }
  if (before.status !== 'not-observed-uncertain' || before.matchedRows !== 0) {
    return result('blocked');
  }

  try {
    const prepared = await ports.transition('prepare', record);
    if (prepared !== 'prepared' && prepared !== 'already-prepared') {
      return result('blocked');
    }
    const dispatched = await ports.transition('dispatch', record);
    if (dispatched !== 'dispatch-once') return result('blocked');
  } catch {
    // Redis may have transitioned despite HTTP/transport failure. Never send.
    return result('blocked');
  }

  // The sole point at which the injected transport can be called. No retry,
  // even if the call throws, times out or reports a failure.
  try {
    await ports.sendOnce();
  } catch {
    // Attempt may have reached Google; read-back remains the sole confirmation.
  }
  const after = await inspectSafe(ports.inspect);
  if (!after) return result('uncertain', 1);
  if (after.status === 'confirmed' && after.matchedRows === 1) {
    return result('confirmed', 1);
  }
  if (after.status === 'duplicate') return result('duplicate', 1);
  if (after.status === 'conflict') return result('conflict', 1);
  return result('uncertain', 1);
}
