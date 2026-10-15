/**
 * Offline Google Sheets v4 AppendCells compiler for Planning V2.
 *
 * NO network calls, OAuth tokens, routes, env reads, storage access, or writes.
 * The caller MUST still prove authenticated user consent/realness, exclusive
 * DEV writer authority, actual sheet metadata and non-retry dispatch gate.
 *
 * Source identity contracts: PAS scripts/daily_planning_v2_preflight.py and
 * scripts/assessment_progress_baseline_preflight.py. A matching hash alone
 * is not proof that a claimed observation occurred.
 */
import { createHash } from 'node:crypto';
import { parseDailyOrientationPayload } from '@/lib/daily-planning/orientation-v2';
import { parsePlanningCivilDay } from '@/lib/planning/civil-day';

export type PlanningV2AppendKind = 'execution' | 'orientation' | 'assessment';
export type PlanningV2AppendResult =
  | { ok: false; reason: 'blocked' }
  | {
      ok: true;
      request: {
        requests: readonly [
          {
            appendCells: {
              sheetId: number;
              rows: readonly [
                {
                  values: readonly {
                    userEnteredValue: { stringValue: string } | { numberValue: number };
                  }[];
                },
              ];
              fields: 'userEnteredValue';
            };
          },
        ];
        includeSpreadsheetInResponse: false;
      };
    };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STAMP = /(?:Z|[+-]\d{2}:\d{2})$/;
const REF = /^[a-z0-9][a-z0-9:_/-]*$/;
const PREFIX = 'vida2:tasks-daily-planning:v2:';
const VERSION = {
  execution: 'planning-execution-v2',
  orientation: 'daily-orientation-v2',
  assessment: 'assessment-progress-v1',
} as const;
const WIDTH = { execution: 17, orientation: 6, assessment: 8 } as const;
const SOURCES = { orientation: 'chatgpt_project', assessment: 'chatgpt_subject_project' };

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const dt = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(dt.getTime()) && dt.toISOString().startsWith(value + 'T');
}
function validStamp(value: unknown): boolean {
  return typeof value === 'string' && STAMP.test(value) && !Number.isNaN(Date.parse(value));
}
function isText(value: unknown, max = 20480): value is string {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') <= max &&
    !/^\s*[=+@-]/.test(value) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  );
}
function jsonCell(value: unknown, maxBytes: number): unknown | null {
  if (!isText(value, maxBytes)) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && JSON.stringify(parsed) === value
      ? parsed
      : null;
  } catch {
    return null;
  }
}
function safeEvidence(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (v) =>
        typeof v === 'string' &&
        v.length > 0 &&
        v.length <= 240 &&
        !/^\s*[=+@-]/.test(v) &&
        !/[\r\n]/.test(v),
    )
  );
}
function execution(row: readonly unknown[]): boolean {
  if (
    !validDay(row[1]) ||
    !validStamp(row[2]) ||
    !isText(row[7], 200) ||
    (row[7] as string).trim().length === 0 ||
    !isText(row[3], 50) ||
    !isText(row[4], 50) ||
    !isText(row[5], 50) ||
    ![
      'task',
      'project',
      'study',
      'gym-movement',
      'recovery-leisure',
      'social',
      'personal-admin',
      'other',
    ].includes(row[3] as string) ||
    ![
      'university',
      'projects',
      'professional',
      'tasks',
      'gym',
      'health',
      'nutrition',
      'personal',
      'other',
    ].includes(row[4] as string) ||
    !['task', 'project', 'subject', 'assessment', 'workout', 'none'].includes(row[5] as string) ||
    (row[6] !== '' && (typeof row[6] !== 'string' || !REF.test(row[6]))) ||
    (row[5] === 'none' && row[6] !== '') ||
    !(
      row[8] === '' ||
      (typeof row[8] === 'number' && Number.isInteger(row[8]) && row[8] >= 0 && row[8] <= 1440)
    ) ||
    !(
      row[9] === '' ||
      (typeof row[9] === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row[9]))
    ) ||
    !['completed', 'partial', 'deferred', 'skipped', 'observed'].includes(row[10] as string) ||
    !['VERIFIED', 'SUPPORTED', 'DECLARED', 'PARTIAL', 'UNVERIFIED', 'CONFLICT', 'UNKNOWN'].includes(
      row[11] as string,
    ) ||
    !['none', 'possible', 'verified', 'conflict', 'unknown'].includes(row[12] as string) ||
    ![
      'user_report',
      'journal_observation',
      'domain_fact',
      'derived_evidence',
      'supporting_telemetry',
      'mixed',
    ].includes(row[13] as string) ||
    !['Alta', 'Media', 'Baja'].includes(row[14] as string) ||
    (row[12] === 'verified' && row[11] !== 'VERIFIED')
  )
    return false;
  const evidence = jsonCell(row[15], 2400);
  if (!safeEvidence(evidence)) return false;
  const corrections = evidence.filter((ref) => ref.startsWith('correction-of:'));
  if (
    corrections.length > 1 ||
    corrections.some(
      (v) => !/^correction-of:vida2:tasks-daily-planning:v2:execution:[a-f0-9]{64}$/.test(v),
    )
  )
    return false;
  // Python casefold is not fully equivalent to JS lowercasing for every
  // Unicode scalar. A mismatch must BLOCK (never rewrite an ID).
  const key = row[6]
    ? 'ref:' + row[6]
    : 'label:' + (row[7] as string).toLowerCase().trim().split(/\s+/u).join(' ');
  const fingerprint = hash(
    JSON.stringify([
      row[1],
      row[3],
      key,
      row[10],
      row[9] || 'none',
      row[8] === '' ? 'none' : row[8],
      row[11],
      row[12],
      row[13],
      row[14],
      [...new Set(evidence)].sort(),
    ]),
  );
  return row[0] === PREFIX + 'execution:' + fingerprint;
}
function orientation(row: readonly unknown[]): boolean {
  if (!validDay(row[1]) || !validStamp(row[2]) || row[4] !== SOURCES.orientation) return false;
  const payload = jsonCell(row[3], 20 * 1024);
  if (!payload || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  if (
    Object.keys(p).length !== 6 ||
    !['review', 'attention', 'upcoming', 'lifeSignals', 'minimum', 'notNow'].every((k) =>
      Object.hasOwn(p, k),
    )
  )
    return false;
  // The plan is for today, while review.date normally refers to yesterday.
  // Use the exact strict reader schema: no unknown/private nested fields,
  // impossible dates, future reviews or snapshots the website would reject.
  const parsed = parseDailyOrientationPayload(p);
  if (!parsed || parsed.review.date > (row[1] as string)) return false;
  if (parsePlanningCivilDay(row[1] as string) === null) return false;
  return row[0] === PREFIX + 'orientation:' + row[1] + ':' + hash(JSON.stringify(sortDeep(p)));
}
function assessment(row: readonly unknown[]): boolean {
  if (
    !isText(row[1], 160) ||
    !isText(row[2], 80) ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(row[1] as string) ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(row[2] as string) ||
    !(row[3] === '' || validDay(row[3])) ||
    !validStamp(row[4]) ||
    row[6] !== SOURCES.assessment
  )
    return false;
  const payload = jsonCell(row[5], 12 * 1024);
  if (!payload || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  const expected = [
    'name',
    'type',
    'status',
    'progressPercent',
    'progressConfidence',
    'readinessBand',
    'remainingMinutesLow',
    'remainingMinutesHigh',
    'etaConfidence',
    'criticalGaps',
    'nextBestActivity',
    'scopeComplete',
    'evidenceCount',
  ];
  if (
    Object.keys(p).length !== expected.length ||
    !expected.every((k) => Object.hasOwn(p, k)) ||
    typeof p.name !== 'string' ||
    typeof p.type !== 'string' ||
    !['planned', 'active'].includes(p.status as string) ||
    p.progressPercent !== null ||
    p.progressConfidence !== 'low' ||
    p.readinessBand !== 'unknown' ||
    p.remainingMinutesLow !== null ||
    p.remainingMinutesHigh !== null ||
    p.etaConfidence !== 'low' ||
    !Array.isArray(p.criticalGaps) ||
    p.criticalGaps.length !== 0 ||
    p.nextBestActivity !== null ||
    p.scopeComplete !== false ||
    p.evidenceCount !== 0
  )
    return false;
  return (
    row[0] ===
    'vida2:assessment-progress:v1:' + hash(JSON.stringify(sortDeep([row[1], row[2], row[3], p])))
  );
}

/**
 * Build an inert request object. Sheet ID is intentionally supplied as a
 * checked number, NOT looked up from environment or sent to any provider here.
 */
export function compilePlanningV2AppendCells(input: {
  kind: PlanningV2AppendKind;
  row: readonly unknown[];
  sheetId: number;
  target: 'dev' | 'prod';
}): PlanningV2AppendResult {
  if (
    input.target !== 'dev' ||
    !Number.isSafeInteger(input.sheetId) ||
    input.sheetId < 0 ||
    input.sheetId >= 2 ** 31 ||
    !Array.isArray(input.row) ||
    !(input.kind in WIDTH) ||
    input.row.length !== WIDTH[input.kind] ||
    input.row[WIDTH[input.kind] - 1] !== VERSION[input.kind]
  )
    return { ok: false, reason: 'blocked' };
  if (
    !(input.kind === 'execution'
      ? execution(input.row)
      : input.kind === 'orientation'
        ? orientation(input.row)
        : assessment(input.row))
  ) {
    return { ok: false, reason: 'blocked' };
  }
  const values: { userEnteredValue: { stringValue: string } | { numberValue: number } }[] = [];
  for (const scalar of input.row) {
    if (typeof scalar === 'string' && isText(scalar)) {
      values.push({ userEnteredValue: { stringValue: scalar } });
    } else if (typeof scalar === 'number' && Number.isSafeInteger(scalar)) {
      values.push({ userEnteredValue: { numberValue: scalar } });
    } else return { ok: false, reason: 'blocked' };
  }
  return {
    ok: true,
    request: {
      requests: [
        { appendCells: { sheetId: input.sheetId, rows: [{ values }], fields: 'userEnteredValue' } },
      ],
      includeSpreadsheetInResponse: false,
    },
  };
}
