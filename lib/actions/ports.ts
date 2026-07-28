/**
 * Puertos inyectables de escritura (Notion / Sheets / Calendar / propuestas).
 * Compensaciones de rollback son ownership-scoped (no destructivos públicos).
 */
import type {
  ActionDiff,
  ActionProposalSummary,
  CalendarHoldCreatePayload,
  GymSessionCreatePayload,
  InboxCapturePayload,
  ProposalCreatePayload,
  ProposalStatus,
  TaskChangeStatusPayload,
  TaskCreatePayload,
} from '@/types/actions';

export type TaskSnapshot = {
  key: string;
  title: string;
  status: string;
  areaKey: string;
  projectKey: string | null;
  projectAreaKey: string | null;
};

export type AreaProjectLink = {
  areaKey: string;
  projectKey: string;
  projectAreaKey: string | null;
};

export type OwnershipProof = string;

export interface NotionTaskWritePort {
  createTask(
    payload: TaskCreatePayload,
    meta: { idempotencyKey: string },
  ): Promise<
    | { ok: true; key: string; ownership: OwnershipProof }
    | { ok: false; code: string; message: string }
  >;
  getTask(key: string): Promise<TaskSnapshot | null>;
  updateTaskStatus(
    key: string,
    nextStatus: TaskChangeStatusPayload['nextStatus'],
    expectedPrevious: string,
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  resolveAreaProjectCompatibility(
    areaKey: string,
    projectKey: string | null,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Rollback ownership-scoped: archiva solo si ownershipProof coincide. */
  archiveOwnedTask(
    key: string,
    ownershipProof: OwnershipProof,
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
}

export interface NotionInboxWritePort {
  appendCapture(
    payload: InboxCapturePayload,
    meta: { idempotencyKey: string },
  ): Promise<
    | { ok: true; key: string; ownership: OwnershipProof }
    | { ok: false; code: string; message: string; preserveText: true }
  >;
  archiveCapture(
    key: string,
    ownership: OwnershipProof,
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  verifyCapture(
    key: string,
  ): Promise<{ ok: true; present: boolean } | { ok: false; message: string }>;
}

export type GymSessionRowStatus = 'pending' | 'complete' | 'partial' | 'failed' | 'reverted';

export interface GymSheetWritePort {
  createPendingSession(
    payload: GymSessionCreatePayload,
    meta: { sessionId: string; idempotencyKey: string; createdAt: string },
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  writeSets(
    sessionId: string,
    sets: GymSessionCreatePayload['sets'],
  ): Promise<{ ok: true; written: number } | { ok: false; written: number; message: string }>;
  verifySession(
    sessionId: string,
    expectedSets: number,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  setSessionStatus(
    sessionId: string,
    status: GymSessionRowStatus,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Compensación: marca reverted (nunca borra filas). */
  markReverted(sessionId: string): Promise<{ ok: true } | { ok: false; message: string }>;
}

export type CalendarHoldSnapshot = {
  key: string;
  title: string;
  start: string;
  end: string;
  ownership: OwnershipProof;
  relatedTaskKey: string | null;
};

export interface CalendarHoldWritePort {
  createHold(
    payload: CalendarHoldCreatePayload,
    meta: { idempotencyKey: string; ownership: OwnershipProof },
  ): Promise<{ ok: true; key: string; ownership: OwnershipProof } | { ok: false; message: string }>;
  getHold(key: string): Promise<CalendarHoldSnapshot | null>;
  deleteHoldWithOwnership(
    key: string,
    ownership: OwnershipProof,
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
}

export type ProposalCreateMeta = {
  key: string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  payloadDigest: string;
  contractVersion: string;
  source: string;
  beforeDigest: string | null;
  diff: ActionDiff | null;
  encryptedPayloadKey: string | null;
  confirmationMode?: ActionProposalSummary['confirmationMode'];
};

export interface ProposalRepositoryPort {
  create(payload: ProposalCreatePayload, meta: ProposalCreateMeta): Promise<ActionProposalSummary>;
  get(key: string): Promise<ActionProposalSummary | null>;
  list(status?: ProposalStatus): Promise<readonly ActionProposalSummary[]>;
  updateStatus(
    key: string,
    status: ProposalStatus,
    patch: Partial<
      Pick<
        ActionProposalSummary,
        | 'decidedAt'
        | 'appliedAt'
        | 'resultCode'
        | 'afterSummary'
        | 'beforeSummary'
        | 'executionStartedAt'
        | 'rollbackDeadline'
        | 'rolledBackAt'
        | 'beforeDigest'
        | 'diff'
        | 'encryptedPayloadKey'
        | 'ownershipDigest'
        | 'targetKey'
      >
    >,
  ): Promise<ActionProposalSummary | null>;
}

const ROLLBACK_METHOD_ALLOWLIST = new Set([
  'archiveCapture',
  'archiveOwnedTask',
  'deleteHoldWithOwnership',
  'markReverted',
]);

/** Garantiza que un puerto no exponga métodos destructivos públicos. */
export function portHasDestructiveMethods(port: object): boolean {
  const keys = Object.keys(port as Record<string, unknown>);
  return keys.some((key) => {
    if (ROLLBACK_METHOD_ALLOWLIST.has(key)) return false;
    return /delete|archive|merge|destroy|drop|removePage|trash/i.test(key);
  });
}
