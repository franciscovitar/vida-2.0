/**
 * Pure OFFLINE consistency contract. No authentication, consent issuance,
 * receipt minting, persistence, environment access, provider calls or writer.
 * All results have writeAuthorized:false, including structurally valid fixtures.
 * Evidence must eventually come from independently verified server adapters;
 * a caller-supplied object or model assertion never establishes that authority.
 */
import { createHash } from 'node:crypto';

import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';

/** Proposed semantic scope only; this is not a registered live capability. */
export const PLANNING_V2_ACCEPTANCE_OPERATION = 'planning-execution-v2:append:dev' as const;

export interface PlanningV2AcceptanceBinding {
  actorKey: string;
  operation: typeof PLANNING_V2_ACCEPTANCE_OPERATION;
  observationId: string;
  rowDigest: string;
  devWorkbookKey: string;
  repetitionKey: string;
}

export interface PlanningV2AcceptanceRequest {
  operation: typeof PLANNING_V2_ACCEPTANCE_OPERATION;
  executionRow: readonly unknown[];
  devWorkbookKey: string;
  intent: 'observation' | 'correction';
  priorObservationId: string | null;
}

/**
 * INTERNAL ONLY. Keys are opaque hashes, not credentials or raw provider IDs.
 * This schema describes evidence an adapter would resolve, NOT its verification.
 * Do not populate it from request fields or serialize it to the browser.
 */
export interface PlanningV2AcceptanceEvidence {
  principal: {
    kind: 'integration-principal' | 'authjs-session';
    authorityKey: string;
    subjectKey: string;
    actorKey: string;
  };
  origin: {
    kind: 'chatgpt-authenticated-invocation' | 'vida-authenticated-acceptance';
    /** Optional host event identity, scoped to the particular normalized intent. */
    eventKey: string | null;
    /** Stable executor acceptance receipt per intent, unchanged across retries. */
    acceptanceKey: string;
  };
  target: { kind: 'dev'; workbookKey: string; productionWorkbookKey: string };
  receipt: PlanningV2AcceptanceBinding;
  consent: {
    mode: 'standing-opt-in' | 'explicit-acceptance';
    decision: 'allow' | 'deny' | 'unavailable';
    policyKey: string;
    binding: PlanningV2AcceptanceBinding;
  };
  history: {
    status: 'complete' | 'unavailable';
    /** Exact lookup scope; completeness must be established by its provider. */
    query: PlanningV2AcceptanceBinding;
    /** Only associations matching the event OR observation in the DEV workbook. */
    entries: readonly PlanningV2AcceptanceBinding[];
  };
}

export type PlanningV2AcceptanceCheck = {
  status: 'consistent-offline' | 'replay-offline' | 'blocked';
  reason:
    | 'consistent-bindings'
    | 'same-accepted-execution'
    | 'invalid-contract'
    | 'authority-evidence-missing'
    | 'origin-mismatch'
    | 'target-mismatch'
    | 'binding-mismatch'
    | 'consent-not-applicable'
    | 'history-unavailable'
    | 'event-content-conflict'
    | 'observation-ambiguous'
    | 'correction-not-supported';
  writeAuthorized: false;
};

const HASH = /^[a-f0-9]{64}$/;
const ID = /^vida2:tasks-daily-planning:v2:execution:[a-f0-9]{64}$/;
const BINDING_KEYS = [
  'actorKey',
  'operation',
  'observationId',
  'rowDigest',
  'devWorkbookKey',
  'repetitionKey',
] as const;

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function hashKey(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function binding(value: unknown): value is PlanningV2AcceptanceBinding {
  return (
    exact(value, BINDING_KEYS) &&
    hashKey(value.actorKey) &&
    value.operation === PLANNING_V2_ACCEPTANCE_OPERATION &&
    typeof value.observationId === 'string' &&
    ID.test(value.observationId) &&
    hashKey(value.rowDigest) &&
    hashKey(value.devWorkbookKey) &&
    hashKey(value.repetitionKey)
  );
}

function sameBinding(a: PlanningV2AcceptanceBinding, b: PlanningV2AcceptanceBinding): boolean {
  return BINDING_KEYS.every((key) => a[key] === b[key]);
}

function evidence(value: unknown): value is PlanningV2AcceptanceEvidence {
  if (!exact(value, ['principal', 'origin', 'target', 'receipt', 'consent', 'history']))
    return false;
  const { principal, origin, target, consent, history } = value;
  return (
    exact(principal, ['kind', 'authorityKey', 'subjectKey', 'actorKey']) &&
    (principal.kind === 'integration-principal' || principal.kind === 'authjs-session') &&
    hashKey(principal.authorityKey) &&
    hashKey(principal.subjectKey) &&
    hashKey(principal.actorKey) &&
    exact(origin, ['kind', 'eventKey', 'acceptanceKey']) &&
    (origin.kind === 'chatgpt-authenticated-invocation' ||
      origin.kind === 'vida-authenticated-acceptance') &&
    (origin.eventKey === null || hashKey(origin.eventKey)) &&
    hashKey(origin.acceptanceKey) &&
    exact(target, ['kind', 'workbookKey', 'productionWorkbookKey']) &&
    target.kind === 'dev' &&
    hashKey(target.workbookKey) &&
    hashKey(target.productionWorkbookKey) &&
    binding(value.receipt) &&
    exact(consent, ['mode', 'decision', 'policyKey', 'binding']) &&
    (consent.mode === 'standing-opt-in' || consent.mode === 'explicit-acceptance') &&
    (consent.decision === 'allow' ||
      consent.decision === 'deny' ||
      consent.decision === 'unavailable') &&
    hashKey(consent.policyKey) &&
    binding(consent.binding) &&
    exact(history, ['status', 'query', 'entries']) &&
    (history.status === 'complete' || history.status === 'unavailable') &&
    binding(history.query) &&
    Array.isArray(history.entries) &&
    history.entries.length <= 64 &&
    history.entries.every(binding)
  );
}

function answer(
  status: PlanningV2AcceptanceCheck['status'],
  reason: PlanningV2AcceptanceCheck['reason'],
): PlanningV2AcceptanceCheck {
  // No row, principal, destination, receipt or provider identifiers in the result.
  return { status, reason, writeAuthorized: false };
}

/**
 * Checks consistency only. Even complete synthetic evidence is NOT authority.
 * Missing original event keys require a stable authenticated executor receipt;
 * this function never creates one or substitutes the Observation ID for it.
 */
export function checkPlanningV2ExecutionAcceptance(
  request: unknown,
  authorityEvidence: unknown,
): PlanningV2AcceptanceCheck {
  const blocked = (reason: PlanningV2AcceptanceCheck['reason']) => answer('blocked', reason);
  try {
    if (
      !exact(request, [
        'operation',
        'executionRow',
        'devWorkbookKey',
        'intent',
        'priorObservationId',
      ]) ||
      request.operation !== PLANNING_V2_ACCEPTANCE_OPERATION ||
      !hashKey(request.devWorkbookKey) ||
      (request.intent !== 'observation' && request.intent !== 'correction') ||
      !(
        request.priorObservationId === null ||
        (typeof request.priorObservationId === 'string' && ID.test(request.priorObservationId))
      )
    ) {
      return blocked('invalid-contract');
    }
    if (request.intent === 'correction' || request.priorObservationId !== null) {
      // The existing inert constructor cannot represent authoritative correction lineage.
      return blocked('correction-not-supported');
    }
    const row = request.executionRow;
    if (
      !Array.isArray(row) ||
      row.length !== 17 ||
      typeof row[0] !== 'string' ||
      row[11] !== 'DECLARED' ||
      row[12] !== 'unknown' ||
      row[13] !== 'user_report' ||
      row[14] !== 'Media' ||
      row[15] !== '[]' ||
      !compilePlanningV2AppendCells({ kind: 'execution', row, sheetId: 0, target: 'dev' }).ok
    ) {
      return blocked('invalid-contract');
    }
    if (!evidence(authorityEvidence)) return blocked('authority-evidence-missing');
    const e = authorityEvidence;
    const chat = e.origin.kind === 'chatgpt-authenticated-invocation';
    if (
      (chat && e.principal.kind !== 'integration-principal') ||
      (!chat &&
        (e.principal.kind !== 'authjs-session' ||
          e.origin.eventKey !== null ||
          e.consent.mode !== 'explicit-acceptance'))
    )
      return blocked('origin-mismatch');
    if (
      request.devWorkbookKey !== e.target.workbookKey ||
      e.target.workbookKey === e.target.productionWorkbookKey
    )
      return blocked('target-mismatch');
    const expected: PlanningV2AcceptanceBinding = {
      actorKey: e.principal.actorKey,
      operation: PLANNING_V2_ACCEPTANCE_OPERATION,
      observationId: row[0],
      rowDigest: createHash('sha256')
        .update(JSON.stringify(['execution', row]))
        .digest('hex'),
      devWorkbookKey: e.target.workbookKey,
      repetitionKey: createHash('sha256')
        .update(
          JSON.stringify([
            PLANNING_V2_ACCEPTANCE_OPERATION,
            e.principal.authorityKey,
            e.principal.subjectKey,
            e.principal.actorKey,
            e.target.workbookKey,
            e.origin.kind,
            e.origin.eventKey,
            e.origin.acceptanceKey,
          ]),
        )
        .digest('hex'),
    };
    if (!sameBinding(expected, e.receipt)) return blocked('binding-mismatch');
    if (e.consent.decision !== 'allow' || !sameBinding(expected, e.consent.binding)) {
      return blocked('consent-not-applicable');
    }
    if (e.history.status !== 'complete' || !sameBinding(expected, e.history.query)) {
      return blocked('history-unavailable');
    }
    const related = e.history.entries.every(
      (entry) =>
        entry.operation === expected.operation &&
        entry.devWorkbookKey === expected.devWorkbookKey &&
        (entry.repetitionKey === expected.repetitionKey ||
          entry.observationId === expected.observationId),
    );
    if (!related) return blocked('history-unavailable');
    const replays = e.history.entries.filter(
      (entry) => entry.repetitionKey === expected.repetitionKey,
    );
    if (replays.some((entry) => !sameBinding(entry, expected)))
      return blocked('event-content-conflict');
    if (
      replays.length > 1 ||
      e.history.entries.some(
        (entry) =>
          entry.observationId === expected.observationId &&
          entry.repetitionKey !== expected.repetitionKey,
      )
    ) {
      // Identical activities in distinct events are ambiguous, not silently deduped.
      return blocked('observation-ambiguous');
    }
    return replays.length === 1
      ? answer('replay-offline', 'same-accepted-execution')
      : answer('consistent-offline', 'consistent-bindings');
  } catch {
    return blocked('invalid-contract');
  }
}
