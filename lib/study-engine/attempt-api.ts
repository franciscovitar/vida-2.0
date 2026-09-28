import type { StudyAttemptEvent } from '@/lib/study-engine/attempt-store';
import type { StudyOperation } from '@/lib/study-engine/items';
import type { StudyLearningEvidenceBridge } from '@/lib/study-engine/learning-evidence-sheet';
import type { StudyRating, StudySchedulerState } from '@/lib/study-engine/scheduler';
import {
  STUDY_ATTEMPT_MAX_WIRE_CHARS,
  type StudyRemoteAttemptStore,
} from '@/lib/study-engine/remote-attempt-store';

const OPERATIONS = new Set<StudyOperation>([
  'recall',
  'explain',
  'discriminate',
  'apply',
  'select',
  'calculate',
  'interpret',
]);
const MODE_ROLES = new Set(['light', 'bridge']);
const INTERACTIONS = new Set([
  'recall_reveal',
  'short_typed',
  'mcq_discriminate',
  'true_false_correct',
  'cloze_context',
  'bridge_microcase',
  'next_step',
  'microcalc',
  'visual_probe',
]);
const RATINGS = new Set<StudyRating>(['again', 'hard', 'good', 'easy']);
const CHANNELS = new Set(['theoretical', 'practical', 'integrative']);
const HELP_LEVELS = new Set(['independent', 'guided', 'assisted']);
const FRESHNESS = new Set(['familiar', 'fresh', 'transfer', 'delayed']);
const FSRS_STATES = new Set(['New', 'Learning', 'Review', 'Relearning']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function nullableString(value: unknown, max = 512): value is string | null {
  return value === null || boundedString(value, max);
}

function optionalNullableString(value: unknown, max = 512): boolean {
  return value === undefined || nullableString(value, max);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function validDate(value: unknown): value is string {
  return boundedString(value, 64) && Number.isFinite(Date.parse(value));
}

function isSchedulerState(value: unknown): value is StudySchedulerState {
  if (!isRecord(value)) return false;
  return (
    validDate(value.dueAt) &&
    finiteNumber(value.stability) &&
    finiteNumber(value.difficulty) &&
    nonNegativeInteger(value.elapsedDays) &&
    nonNegativeInteger(value.scheduledDays) &&
    nonNegativeInteger(value.learningSteps) &&
    nonNegativeInteger(value.reps) &&
    nonNegativeInteger(value.lapses) &&
    typeof value.state === 'string' &&
    FSRS_STATES.has(value.state) &&
    (value.lastReview === null || validDate(value.lastReview))
  );
}

export function parseStudyAttemptEvent(value: unknown): StudyAttemptEvent | null {
  if (!isRecord(value)) return null;

  if (
    !boundedString(value.id, 128) ||
    !boundedString(value.idempotencyKey, 128) ||
    !boundedString(value.sessionId, 128) ||
    !boundedString(value.studyItemId, 256) ||
    !nonNegativeInteger(value.itemVersion) ||
    value.itemVersion < 1 ||
    !nullableString(value.reviewUnitId, 256) ||
    !boundedString(value.subjectId, 256) ||
    !nullableString(value.conceptId, 256) ||
    !nullableString(value.facetId, 256) ||
    !optionalNullableString(value.variantFamily, 256) ||
    !optionalNullableString(value.evidenceCeiling, 256) ||
    !(
      value.modeRole === undefined ||
      value.modeRole === null ||
      (typeof value.modeRole === 'string' && MODE_ROLES.has(value.modeRole))
    ) ||
    !(
      value.interaction === undefined ||
      value.interaction === null ||
      (typeof value.interaction === 'string' && INTERACTIONS.has(value.interaction))
    ) ||
    typeof value.operation !== 'string' ||
    !OPERATIONS.has(value.operation as StudyOperation) ||
    typeof value.channel !== 'string' ||
    !CHANNELS.has(value.channel) ||
    !validDate(value.shownAt) ||
    !validDate(value.answeredAt) ||
    !nonNegativeInteger(value.responseTimeMs) ||
    !nullableString(value.response, 8_192) ||
    !(value.correctness === null || typeof value.correctness === 'boolean') ||
    typeof value.rating !== 'string' ||
    !RATINGS.has(value.rating as StudyRating) ||
    !(
      value.learnerConfidence === null ||
      (finiteNumber(value.learnerConfidence) &&
        value.learnerConfidence >= 0 &&
        value.learnerConfidence <= 1)
    ) ||
    typeof value.helpLevel !== 'string' ||
    !HELP_LEVELS.has(value.helpLevel) ||
    typeof value.seenBefore !== 'boolean' ||
    typeof value.contextFreshness !== 'string' ||
    !FRESHNESS.has(value.contextFreshness) ||
    !(value.schedulerStateBefore === null || isSchedulerState(value.schedulerStateBefore)) ||
    !(value.schedulerStateAfter === null || isSchedulerState(value.schedulerStateAfter)) ||
    !boundedString(value.deviceId, 128)
  ) {
    return null;
  }

  if (Date.parse(value.answeredAt) < Date.parse(value.shownAt)) return null;
  return value as unknown as StudyAttemptEvent;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function handleStudyAttemptPost(
  request: Request,
  userId: string,
  store: StudyRemoteAttemptStore,
  evidenceBridge: StudyLearningEvidenceBridge | null = null,
): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ ok: false, error: 'forbidden-origin' }, 403);
  }

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'unsupported-media-type' }, 415);
  }

  const idempotencyKey = request.headers.get('idempotency-key');
  if (
    !idempotencyKey ||
    idempotencyKey !== idempotencyKey.trim() ||
    idempotencyKey.length > 128 ||
    /\s/.test(idempotencyKey)
  ) {
    return json({ ok: false, error: 'invalid-idempotency-key' }, 400);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, error: 'invalid-body' }, 400);
  }
  if (!raw || raw.length > STUDY_ATTEMPT_MAX_WIRE_CHARS) {
    return json({ ok: false, error: 'invalid-body' }, 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'invalid-json' }, 400);
  }

  if (!isRecord(parsed) || Object.keys(parsed).length !== 1) {
    return json({ ok: false, error: 'invalid-attempt' }, 400);
  }
  const attempt = parseStudyAttemptEvent(parsed.attempt);
  if (!attempt) return json({ ok: false, error: 'invalid-attempt' }, 400);
  if (attempt.idempotencyKey !== idempotencyKey) {
    return json({ ok: false, error: 'idempotency-mismatch' }, 400);
  }

  let ack;
  try {
    ack = await store.acceptAttempt(userId, attempt);
  } catch {
    return json({ ok: false, error: 'remote-store-unavailable' }, 503);
  }

  if (ack.status === 'conflict') {
    return json({ ok: false, ...ack }, 409);
  }

  if (attempt.subjectId === 'study-engine-demo') {
    return json({ ok: true, ...ack }, 200);
  }

  if (!evidenceBridge) {
    return json({ ok: false, error: 'learning-evidence-unavailable' }, 503);
  }

  let evidence;
  try {
    evidence = await evidenceBridge.recordAttempt(attempt);
  } catch {
    return json({ ok: false, error: 'learning-evidence-unavailable' }, 503);
  }

  if (evidence.status === 'conflict') {
    return json(
      {
        ok: false,
        idempotencyKey: attempt.idempotencyKey,
        status: 'conflict',
      },
      409,
    );
  }

  if (evidence.status === 'unmapped') {
    return json({ ok: false, error: 'learning-evidence-unmapped' }, 422);
  }

  if (evidence.status === 'unavailable') {
    return json({ ok: false, error: 'learning-evidence-unavailable' }, 503);
  }

  return json({ ok: true, ...ack }, 200);
}
