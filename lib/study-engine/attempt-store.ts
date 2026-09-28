import type { StudyItemInteraction, StudyItemModeRole, StudyOperation } from './items';
import type { StudyRating, StudySchedulerState } from './scheduler';

export type StudyEvidenceChannel = 'theoretical' | 'practical' | 'integrative';
export type StudyHelpLevel = 'independent' | 'guided' | 'assisted';
export type StudyContextFreshness = 'familiar' | 'fresh' | 'transfer' | 'delayed';

export interface StudyAttemptEvent {
  id: string;
  idempotencyKey: string;
  sessionId: string;
  studyItemId: string;
  itemVersion: number;
  reviewUnitId: string | null;
  subjectId: string;
  conceptId: string | null;
  facetId: string | null;
  variantFamily?: string | null;
  modeRole?: StudyItemModeRole | null;
  interaction?: StudyItemInteraction | null;
  evidenceCeiling?: string | null;
  operation: StudyOperation;
  channel: StudyEvidenceChannel;
  shownAt: string;
  answeredAt: string;
  responseTimeMs: number;
  response: string | null;
  correctness: boolean | null;
  rating: StudyRating;
  learnerConfidence: number | null;
  helpLevel: StudyHelpLevel;
  seenBefore: boolean;
  contextFreshness: StudyContextFreshness;
  schedulerStateBefore: StudySchedulerState | null;
  schedulerStateAfter: StudySchedulerState | null;
  deviceId: string;
}

export interface PendingStudyAttempt {
  idempotencyKey: string;
  attemptId: string;
  enqueuedAt: string;
}

export interface AttemptOutboxStore {
  persistAttempt(attempt: StudyAttemptEvent): Promise<void>;
  listAttempts(): Promise<StudyAttemptEvent[]>;
  listPendingAttempts(): Promise<StudyAttemptEvent[]>;
  markAttemptSynced(idempotencyKey: string): Promise<void>;
}

export function latestAttemptForStudyItem(
  attempts: readonly StudyAttemptEvent[],
  studyItemId: string,
): StudyAttemptEvent | null {
  let latest: StudyAttemptEvent | null = null;
  for (const attempt of attempts) {
    if (attempt.studyItemId !== studyItemId) continue;
    if (!latest || attempt.answeredAt.localeCompare(latest.answeredAt) > 0) {
      latest = attempt;
    }
  }
  return latest ? structuredClone(latest) : null;
}

export function latestAttemptForReviewUnit(
  attempts: readonly StudyAttemptEvent[],
  reviewUnitId: string,
): StudyAttemptEvent | null {
  let latest: StudyAttemptEvent | null = null;
  for (const attempt of attempts) {
    if (attempt.reviewUnitId !== reviewUnitId) continue;
    if (!latest || attempt.answeredAt.localeCompare(latest.answeredAt) > 0) {
      latest = attempt;
    }
  }
  return latest ? structuredClone(latest) : null;
}

export function createStudyAttemptEvent(
  input: Omit<StudyAttemptEvent, 'responseTimeMs'>,
): StudyAttemptEvent {
  const shownAtMs = Date.parse(input.shownAt);
  const answeredAtMs = Date.parse(input.answeredAt);
  const responseTimeMs =
    Number.isFinite(shownAtMs) && Number.isFinite(answeredAtMs)
      ? Math.max(0, answeredAtMs - shownAtMs)
      : 0;

  return { ...input, responseTimeMs };
}

function sameAttempt(left: StudyAttemptEvent, right: StudyAttemptEvent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class MemoryAttemptOutboxStore implements AttemptOutboxStore {
  private readonly attempts = new Map<string, StudyAttemptEvent>();
  private readonly outbox = new Map<string, PendingStudyAttempt>();

  async persistAttempt(attempt: StudyAttemptEvent): Promise<void> {
    const existingAttempt = this.attempts.get(attempt.id);
    const existingPending = this.outbox.get(attempt.idempotencyKey);

    if (existingAttempt || existingPending) {
      if (
        existingAttempt &&
        existingPending?.attemptId === attempt.id &&
        sameAttempt(existingAttempt, attempt)
      ) {
        return;
      }
      throw new Error('Attempt id/idempotency conflict');
    }

    this.attempts.set(attempt.id, structuredClone(attempt));
    this.outbox.set(attempt.idempotencyKey, {
      idempotencyKey: attempt.idempotencyKey,
      attemptId: attempt.id,
      enqueuedAt: attempt.answeredAt,
    });
  }

  async listAttempts(): Promise<StudyAttemptEvent[]> {
    return [...this.attempts.values()]
      .map((attempt) => structuredClone(attempt))
      .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  }

  async listPendingAttempts(): Promise<StudyAttemptEvent[]> {
    const pending = [...this.outbox.values()].sort((a, b) =>
      a.enqueuedAt.localeCompare(b.enqueuedAt),
    );

    return pending
      .map((entry) => this.attempts.get(entry.attemptId))
      .filter((attempt): attempt is StudyAttemptEvent => Boolean(attempt))
      .map((attempt) => structuredClone(attempt));
  }

  async markAttemptSynced(idempotencyKey: string): Promise<void> {
    this.outbox.delete(idempotencyKey);
  }
}
