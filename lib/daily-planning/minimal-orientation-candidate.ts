/**
 * Inert bridge from an approved ChatGPT analysis to the existing six-cell
 * Daily Planning contract. No network, environment, OAuth, consent, or writes.
 *
 * A deterministic content ID provides replay matching, NOT a trusted intent
 * receipt, a durable single-writer lock, or permission to append.
 */
import { createHash } from 'node:crypto';

import { parseDailyOrientationPayload, selectLatestDailyOrientationSnapshot } from '@/lib/daily-planning/orientation-v2';
import { reconcilePlanningV2Readback } from '@/lib/daily-planning/write-reconciliation-v2';
import { parsePlanningCivilDay } from '@/lib/planning/civil-day';

const PREFIX = 'vida2:tasks-daily-planning:v2:orientation:';
const SOURCE = 'chatgpt_project';
const VERSION = 'daily-orientation-v2';
const STAMP = /(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_BYTES = 20 * 1024;

type OrientationRow = readonly [string, string, string, string, typeof SOURCE, typeof VERSION];

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, part]) => [key, sorted(part)]),
    );
  return value;
}

export type MinimalOrientationCandidate =
  | { ok: false; reason: 'invalid-candidate' }
  | { ok: true; row: OrientationRow };

/**
 * The plan date is today (or the target day); review.date describes the
 * observed day, commonly yesterday. Strictly sanitize with Vida's own parser.
 */
export function buildMinimalOrientationCandidate(input: {
  planDate: string;
  generatedAt: string;
  payload: unknown;
}): MinimalOrientationCandidate {
  if (
    parsePlanningCivilDay(input.planDate) === null ||
    typeof input.generatedAt !== 'string' ||
    !STAMP.test(input.generatedAt) ||
    !Number.isFinite(Date.parse(input.generatedAt))
  ) return { ok: false, reason: 'invalid-candidate' };

  const payload = parseDailyOrientationPayload(input.payload);
  if (!payload || payload.review.date > input.planDate) {
    return { ok: false, reason: 'invalid-candidate' };
  }

  const payloadCell = JSON.stringify(payload);
  if (Buffer.byteLength(payloadCell, 'utf8') > MAX_BYTES) {
    return { ok: false, reason: 'invalid-candidate' };
  }

  const digest = createHash('sha256')
    .update(JSON.stringify(sorted(payload)), 'utf8')
    .digest('hex');
  return {
    ok: true,
    row: [
      `${PREFIX}${input.planDate}:${digest}`,
      input.planDate,
      input.generatedAt,
      payloadCell,
      SOURCE,
      VERSION,
    ],
  };
}

export type MinimalOrientationReadbackStatus =
  | 'confirmed-current'
  | 'confirmed-not-current'
  | 'absent-or-uncertain'
  | 'blocked';

/**
 * Only meaningful when the caller supplies a COMPLETE, authorized DEV read.
 * This never says "safe to write"; an absent row can still be in flight.
 */
export function checkMinimalOrientationReadback(input: {
  candidate: OrientationRow;
  rows: readonly (readonly unknown[])[] | null;
  readComplete: boolean;
  readStatus: 'ready' | 'error';
}): MinimalOrientationReadbackStatus {
  const reconciled = reconcilePlanningV2Readback({
    kind: 'orientation',
    candidateRow: input.candidate,
    rows: input.rows,
    readComplete: input.readComplete,
    readStatus: input.readStatus,
  });
  if (reconciled.status === 'not-observed-uncertain') return 'absent-or-uncertain';
  if (reconciled.status !== 'confirmed' || !input.rows) return 'blocked';

  // Prove the actual Vida reader accepts the row and resolves it as current.
  const displayed = selectLatestDailyOrientationSnapshot(input.rows, input.candidate[1]);
  if (displayed.status !== 'ready' || displayed.snapshot === null) return 'blocked';
  return displayed.snapshot.id === input.candidate[0]
    ? 'confirmed-current'
    : 'confirmed-not-current';
}
