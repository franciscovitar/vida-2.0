/**
 * PURE specification, not a writer or persistence adapter. A returned nextState
 * and effect are only a proposal. A real dispatcher MUST atomically persist
 * the entire aggregate by expected revision and acknowledge durability BEFORE
 * its sole provider attempt. Unknown CAS outcome means NO SEND, never retry.
 * No endpoint, timers, env flag, process store, provider port or I/O exists here.
 */
import {
  buildAssessmentCloseoutCandidate,
  closeoutHash,
  type AssessmentCloseoutContext,
  type AssessmentCloseoutCandidate,
} from '@/lib/assessment-progress/closeout-candidate';
import { selectLatestAssessmentProgressSnapshots } from '@/lib/assessment-progress/snapshot';
import { reconcilePlanningV2Readback } from '@/lib/daily-planning/write-reconciliation-v2';

type ReceiptStatus = 'dispatched' | 'confirmed' | 'uncertain' | 'duplicate' | 'conflict';
interface Receipt {
  digest: string;
  snapshotId: string;
  assessmentKey: string;
  generatedAt: string;
  status: ReceiptStatus;
}

export interface AssessmentDispatchModel {
  revision: number;
  /** Immutable actor/writer/DEV destination binding, established separately. */
  binding: string;
  /** One slot across ALL seven subjects, retained until exact confirmation. */
  activeIntent: string | null;
  /** Non-expiring receipts. No deletion, lease expiry or automatic reseeding. */
  receipts: Readonly<Record<string, Receipt>>;
}

export interface AssessmentCloseoutRead {
  rows: readonly (readonly unknown[])[] | null;
  readStatus: 'ready' | 'error';
  readComplete: boolean;
}
type DecisionStatus =
  | 'blocked'
  | 'stale'
  | 'busy'
  | 'replay'
  | 'conflict'
  | 'duplicate'
  | 'uncertain'
  | 'already-visible'
  | 'dispatch-proposed'
  | 'confirmed';
export interface AssessmentDispatchDecision {
  status: DecisionStatus;
  nextState: AssessmentDispatchModel | null;
  /** A model effect is NOT a live send permission. */
  effect: 'none' | 'dispatch-once-after-durable-cas';
  retryAllowed: false;
}
interface ModelInput {
  state: AssessmentDispatchModel | null;
  expectedRevision: number;
  closeout: unknown;
  context: AssessmentCloseoutContext | null;
  read: AssessmentCloseoutRead;
}

function decision(
  status: DecisionStatus,
  nextState: AssessmentDispatchModel | null = null,
  dispatch = false,
): AssessmentDispatchDecision {
  return {
    status,
    nextState,
    effect: dispatch ? 'dispatch-once-after-durable-cas' : 'none',
    retryAllowed: false,
  };
}

/** Fail closed on missing/corrupt aggregate; a missing store is NOT first use. */
function validState(state: AssessmentDispatchModel | null): state is AssessmentDispatchModel {
  if (
    !state ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    state.revision >= Number.MAX_SAFE_INTEGER ||
    !/^[a-f0-9]{64}$/.test(state.binding) ||
    !state.receipts ||
    typeof state.receipts !== 'object' ||
    Array.isArray(state.receipts)
  )
    return false;
  for (const [id, receipt] of Object.entries(state.receipts)) {
    if (
      !/^[a-f0-9]{64}$/.test(id) ||
      !receipt ||
      !/^[a-f0-9]{64}$/.test(receipt.digest) ||
      !/^vida2:assessment-progress:v1:[a-f0-9]{64}$/.test(receipt.snapshotId) ||
      !/^[a-f0-9]{64}$/.test(receipt.assessmentKey) ||
      !Number.isFinite(Date.parse(receipt.generatedAt)) ||
      !['dispatched', 'confirmed', 'uncertain', 'duplicate', 'conflict'].includes(receipt.status) ||
      (receipt.status !== 'confirmed' && state.activeIntent !== id)
    )
      return false;
  }
  return (
    state.activeIntent === null ||
    (Object.hasOwn(state.receipts, state.activeIntent) &&
      state.receipts[state.activeIntent].status !== 'confirmed')
  );
}

function receipt(
  state: AssessmentDispatchModel,
  candidate: AssessmentCloseoutCandidate,
  status: ReceiptStatus,
): AssessmentDispatchModel {
  return {
    ...state,
    revision: state.revision + 1,
    activeIntent: status === 'confirmed' ? null : candidate.intentId,
    receipts: {
      ...state.receipts,
      [candidate.intentId]: {
        digest: candidate.digest,
        snapshotId: candidate.row[0],
        assessmentKey: closeoutHash([candidate.row[2], candidate.row[1]]),
        generatedAt: candidate.row[4],
        status,
      },
    },
  };
}

function inspect(
  candidate: AssessmentCloseoutCandidate,
  read: AssessmentCloseoutRead,
  exactTimestamp: boolean,
) {
  const reconciled = reconcilePlanningV2Readback({
    kind: 'assessment',
    candidateRow: candidate.row,
    ...read,
  });
  if (!read.rows || !['confirmed', 'not-observed-uncertain'].includes(reconciled.status))
    return reconciled.status;
  // Reuse the actual consumer: structurally equal invalid JSON is not success.
  const parsed = selectLatestAssessmentProgressSnapshots(read.rows);
  if (!['ready', 'empty'].includes(parsed.status)) return 'schema-blocked';
  const ids = new Set<unknown>();
  for (const row of read.rows.slice(1)) {
    if (row.every((cell) => cell === '' || cell === null)) continue;
    if (ids.has(row[0])) return 'duplicate';
    ids.add(row[0]);
  }
  if (
    reconciled.status === 'confirmed' &&
    exactTimestamp &&
    read.rows.find((row) => row[0] === candidate.row[0])?.[4] !== candidate.row[4]
  )
    return 'conflict';
  return reconciled.status;
}

function validated(
  input: ModelInput,
): { state: AssessmentDispatchModel; candidate: AssessmentCloseoutCandidate } | null {
  if (!validState(input.state) || input.state.revision !== input.expectedRevision) return null;
  const candidate = buildAssessmentCloseoutCandidate(input.closeout, input.context);
  return candidate && candidate.binding === input.state.binding
    ? { state: input.state, candidate }
    : null;
}

/**
 * Propose a single atomic dispatch decision. The event receipt and global busy
 * slot MUST commit together: per-event dedupe alone permits concurrent writers.
 * No live adapter is available/certified; callers cannot send from this model.
 */
export function planAssessmentCloseoutDispatch(input: ModelInput): AssessmentDispatchDecision {
  const valid = validated(input);
  if (!valid) return decision('blocked');
  const { state, candidate } = valid;
  const old = state.receipts[candidate.intentId];
  if (old) {
    if (old.digest !== candidate.digest) return decision('conflict');
    return decision(
      old.status === 'confirmed'
        ? 'replay'
        : old.status === 'dispatched'
          ? 'uncertain'
          : old.status,
    );
  }
  if (state.activeIntent !== null) return decision('busy');
  const assessmentKey = closeoutHash([candidate.row[2], candidate.row[1]]);
  if (
    Object.values(state.receipts).some(
      (entry) =>
        entry.assessmentKey === assessmentKey &&
        entry.snapshotId !== candidate.row[0] &&
        Date.parse(entry.generatedAt) >= Date.parse(candidate.row[4]),
    )
  )
    return decision('stale');
  const before = inspect(candidate, input.read, false);
  if (before === 'duplicate' || before === 'conflict') return decision(before);
  if (before !== 'confirmed' && before !== 'not-observed-uncertain') return decision('blocked');
  // This is append-only history. A complete read losing a confirmed receipt
  // indicates the wrong store, data loss or drift; never start a fresh history.
  const observedIds = new Set(input.read.rows?.slice(1).map((row) => row[0]));
  if (
    Object.values(state.receipts).some(
      (entry) => entry.status === 'confirmed' && !observedIds.has(entry.snapshotId),
    )
  )
    return decision('blocked');
  const current = selectLatestAssessmentProgressSnapshots(input.read.rows ?? []).snapshots.find(
    (snapshot) => snapshot.assessmentId === candidate.row[1],
  );
  // Same assessment must belong to the resolved subject. Older or tied events
  // cannot overwrite newer material state in Vida's timestamp-based reader.
  if (
    current &&
    (current.subjectId !== candidate.row[2] ||
      (current.snapshotId !== candidate.row[0] &&
        Date.parse(current.generatedAt) >= Date.parse(candidate.row[4])))
  )
    return decision('stale');
  // A historical content ID cannot represent a NEW return to an older state.
  // Do not duplicate its ID or claim the old row is the current Vida snapshot.
  if (before === 'confirmed')
    return current?.snapshotId === candidate.row[0]
      ? decision('already-visible', receipt(state, candidate, 'confirmed'))
      : decision('stale');
  return decision('dispatch-proposed', receipt(state, candidate, 'dispatched'), true);
}

/** Read-only recovery: only exact confirmation clears an uncertain busy slot. */
export function planAssessmentCloseoutReadback(input: ModelInput): AssessmentDispatchDecision {
  const valid = validated(input);
  if (!valid) return decision('blocked');
  const { state, candidate } = valid;
  const old = state.receipts[candidate.intentId];
  if (!old || old.digest !== candidate.digest) return decision('conflict');
  if (old.status === 'confirmed') return decision('replay');
  if (old.status === 'duplicate' || old.status === 'conflict') return decision(old.status);
  if (state.activeIntent !== candidate.intentId) return decision('blocked');
  const observed = inspect(candidate, input.read, true);
  const status =
    observed === 'confirmed'
      ? 'confirmed'
      : observed === 'duplicate'
        ? 'duplicate'
        : observed === 'conflict'
          ? 'conflict'
          : 'uncertain';
  return decision(status, receipt(state, candidate, status));
}
