/**
 * Pure, inert conversion of a reported activity into a Planning Execution V2
 * candidate. Neither the text nor this candidate attests a ChatGPT identity,
 * a real-world event, resolved entity, user consent, or write authorization.
 * A trusted channel must independently verify those BEFORE any dispatch.
 *
 * No Journaling, evidence bodies, credentials, sessions, network or storage.
 */
import { createHash } from 'node:crypto';

import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';

export type PlanningV2ReportedActivity = {
  day: string;
  recordedAt: string;
  activityType: string;
  domain: string;
  entityType: string;
  canonicalRef: string | null;
  activity: string;
  declaredMinutes: number | null;
  actualStart: string | null;
  executionState: string;
};

export type PlanningV2ProposedExecution =
  | { status: 'blocked' }
  | {
      status: 'candidate-only';
      /** This row is NOT a consent/provenance attestation or write command. */
      row: readonly unknown[];
    };

const KEYS = [
  'day',
  'recordedAt',
  'activityType',
  'domain',
  'entityType',
  'canonicalRef',
  'activity',
  'declaredMinutes',
  'actualStart',
  'executionState',
] as const;
const TYPES = [
  'task',
  'project',
  'study',
  'gym-movement',
  'recovery-leisure',
  'social',
  'personal-admin',
  'other',
];
const DOMAINS = [
  'university',
  'projects',
  'professional',
  'tasks',
  'gym',
  'health',
  'nutrition',
  'personal',
  'other',
];
const ENTITIES = ['task', 'project', 'subject', 'assessment', 'workout', 'none'];
const STATES = ['completed', 'partial', 'deferred', 'skipped', 'observed'];
const REFERENCE = /^[a-z0-9][a-z0-9:_/-]{0,239}$/;
const PREFIX = 'vida2:tasks-daily-planning:v2:execution:';

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const day = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value + 'T');
}

function validStamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /(?:Z|[+-]\\d{2}:\\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/** Rejects unexpected fields, including raw conversation and consent claims. */
export function proposePlanningV2ReportedExecution(
  input: unknown,
): PlanningV2ProposedExecution {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'blocked' };
  }
  const fields = input as Record<string, unknown>;
  if (
    Object.keys(fields).length !== KEYS.length ||
    !KEYS.every((key) => Object.hasOwn(fields, key)) ||
    !validDay(fields.day) ||
    !validStamp(fields.recordedAt) ||
    !TYPES.includes(fields.activityType as string) ||
    !DOMAINS.includes(fields.domain as string) ||
    !ENTITIES.includes(fields.entityType as string) ||
    !STATES.includes(fields.executionState as string)
  ) {
    return { status: 'blocked' };
  }

  const rawRef = fields.canonicalRef;
  if (
    !(rawRef === null || (typeof rawRef === 'string' && REFERENCE.test(rawRef))) ||
    (fields.entityType === 'none' && rawRef !== null)
  ) {
    return { status: 'blocked' };
  }
  const ref = rawRef === null ? '' : (rawRef as string);
  const rawLabel = fields.activity;
  if (typeof rawLabel !== 'string') return { status: 'blocked' };
  // Do not paste paragraphs, URLs, formula expressions or Journal text.
  const activity = rawLabel.normalize('NFC').trim().split(/\\s+/u).join(' ');
  if (
    !activity ||
    activity.length > 200 ||
    /[\\x00-\\x1f\\x7f]/u.test(rawLabel) ||
    /^[=+@-]/u.test(activity) ||
    /https?:\\/\\//iu.test(activity)
  ) {
    return { status: 'blocked' };
  }

  const minutes = fields.declaredMinutes;
  if (
    minutes !== null &&
    (typeof minutes !== 'number' ||
      !Number.isSafeInteger(minutes) ||
      minutes < 0 ||
      minutes > 1440)
  ) {
    return { status: 'blocked' };
  }
  const actualStart = fields.actualStart;
  if (
    actualStart !== null &&
    (typeof actualStart !== 'string' ||
      !/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(actualStart))
  ) {
    return { status: 'blocked' };
  }

  const duration = minutes === null ? '' : minutes;
  const start = actualStart === null ? '' : actualStart;
  const identity = ref
    ? 'ref:' + ref
    : 'label:' + activity.toLowerCase().trim().split(/\\s+/u).join(' ');
  // Mirror the already-certified append-cells-v2 identity exactly.
  // Classification is deliberately never elevated from a user report.
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        fields.day,
        fields.activityType,
        identity,
        fields.executionState,
        start || 'none',
        duration === '' ? 'none' : duration,
        'DECLARED',
        'unknown',
        'user_report',
        'Media',
        [],
      ]),
    )
    .digest('hex');

  const row: readonly unknown[] = [
    PREFIX + fingerprint,
    fields.day,
    fields.recordedAt,
    fields.activityType,
    fields.domain,
    fields.entityType,
    ref,
    activity,
    duration,
    start,
    fields.executionState,
    'DECLARED',
    'unknown',
    'user_report',
    'Media',
    '[]',
    'planning-execution-v2',
  ];
  if (!compilePlanningV2AppendCells({ kind: 'execution', row, sheetId: 0, target: 'dev' }).ok) {
    return { status: 'blocked' };
  }
  return { status: 'candidate-only', row: Object.freeze(row) };
}
