/**
 * Puertos inyectables de escritura (Notion / Sheets / propuestas).
 * Sin métodos destructivos públicos.
 */
import type {
  ActionProposalSummary,
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

export interface NotionTaskWritePort {
  createTask(
    payload: TaskCreatePayload,
    meta: { idempotencyKey: string },
  ): Promise<{ ok: true; key: string } | { ok: false; code: string; message: string }>;
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
}

export interface NotionInboxWritePort {
  appendCapture(
    payload: InboxCapturePayload,
    meta: { idempotencyKey: string },
  ): Promise<
    { ok: true; key: string } | { ok: false; code: string; message: string; preserveText: true }
  >;
}

export type GymSessionRowStatus = 'pending' | 'complete' | 'partial' | 'failed';

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
}

export interface ProposalRepositoryPort {
  create(
    payload: ProposalCreatePayload,
    meta: { key: string; idempotencyKey: string; createdAt: string },
  ): Promise<ActionProposalSummary>;
  get(key: string): Promise<ActionProposalSummary | null>;
  list(status?: ProposalStatus): Promise<readonly ActionProposalSummary[]>;
  updateStatus(
    key: string,
    status: ProposalStatus,
    patch: Partial<
      Pick<ActionProposalSummary, 'decidedAt' | 'appliedAt' | 'resultCode' | 'afterSummary'>
    >,
  ): Promise<ActionProposalSummary | null>;
}

/** Garantiza que un puerto no exponga métodos destructivos. */
export function portHasDestructiveMethods(port: object): boolean {
  const keys = Object.keys(port as Record<string, unknown>);
  return keys.some((key) => /delete|archive|merge|destroy|drop|removePage|trash/i.test(key));
}
