/**
 * Inert session closeout projection. No auth endpoint, credentials, network,
 * persistence or write permission. Context MUST eventually come from a trusted
 * server issuer: hashes supplied by a caller are not evidence or authorization.
 */
import { createHash } from 'node:crypto';

import { parseAssessmentProgressPayload } from '@/lib/assessment-progress/snapshot';
import { parsePlanningCivilDay } from '@/lib/planning/civil-day';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9_-]{0,159}$/;
const STAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const SUBJECTS = ['iop', 'cdd', 'dsi', 'dao', 'redes', 'tpa', 'green'];
export const ASSESSMENT_CLOSEOUT_WRITER_MODE = 'SHADOW_READ_ONLY' as const;

export interface AssessmentCloseoutContext {
  /** Opaque identity from authorized session; null means no authorized issuer. */
  actorHash: string;
  writerHash: string;
  /** Authorization must name this exact closeout, not arbitrary future events. */
  authorizedCloseoutId: string;
  target: {
    environment: 'dev';
    workbookHash: string;
    productionWorkbookHash: string;
    sheetId: number;
  };
  /** Resolved privately from current PAS main; never invent an assessment ID. */
  assessment: {
    id: string;
    subjectId: string;
    name: string;
    type: string;
    date: string | null;
    dateSource: 'official' | 'calendar' | 'user-reported' | 'unavailable';
    metric: 'assessment-weighted-readiness' | 'verified-requirements';
    pasMainSha: string;
  };
}

export type AssessmentCloseoutRow = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
export interface AssessmentCloseoutCandidate {
  row: AssessmentCloseoutRow;
  intentId: string;
  digest: string;
  binding: string;
}

export function closeoutHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (object(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  return value;
}

/**
 * The strict payload remains assessment-progress-v1. Evidence provenance stays
 * in the private receipt, not extra Sheet columns or raw conversation fields.
 * This validates declared provenance, NOT the academic truth of that evidence.
 */
export function buildAssessmentCloseoutCandidate(
  input: unknown,
  context: AssessmentCloseoutContext | null,
): AssessmentCloseoutCandidate | null {
  if (
    !context ||
    !object(input) ||
    !exact(input, ['closeoutId', 'generatedAt', 'payload', 'basis'])
  )
    return null;
  const { actorHash, writerHash, target, assessment } = context;
  if (
    !HASH.test(actorHash) ||
    !HASH.test(writerHash) ||
    typeof input.closeoutId !== 'string' ||
    !ID.test(input.closeoutId) ||
    input.closeoutId !== context.authorizedCloseoutId ||
    target.environment !== 'dev' ||
    !HASH.test(target.workbookHash) ||
    !HASH.test(target.productionWorkbookHash) ||
    target.workbookHash === target.productionWorkbookHash ||
    !Number.isSafeInteger(target.sheetId) ||
    target.sheetId < 0 ||
    target.sheetId >= 2 ** 31 ||
    !ID.test(assessment.id) ||
    !SUBJECTS.includes(assessment.subjectId) ||
    !/^[a-f0-9]{40}$/.test(assessment.pasMainSha) ||
    !['official', 'calendar', 'user-reported', 'unavailable'].includes(assessment.dateSource) ||
    (assessment.date === null
      ? assessment.dateSource !== 'unavailable'
      : parsePlanningCivilDay(assessment.date) === null ||
        assessment.dateSource === 'unavailable') ||
    !['assessment-weighted-readiness', 'verified-requirements'].includes(assessment.metric) ||
    typeof input.generatedAt !== 'string' ||
    input.generatedAt.length > 40 ||
    !STAMP.test(input.generatedAt) ||
    !Number.isFinite(Date.parse(input.generatedAt)) ||
    parsePlanningCivilDay(input.generatedAt.slice(0, 10)) === null
  )
    return null;

  const payload = parseAssessmentProgressPayload(input.payload);
  const basis = input.basis;
  if (
    !payload ||
    payload.name !== assessment.name ||
    payload.type !== assessment.type ||
    !object(basis) ||
    !exact(basis, [
      'metric',
      'scopeDigest',
      'modelDigest',
      'evidenceDigest',
      'etaCalibrationDigest',
    ])
  )
    return null;
  for (const key of ['scopeDigest', 'modelDigest', 'evidenceDigest', 'etaCalibrationDigest']) {
    if (basis[key] !== null && (typeof basis[key] !== 'string' || !HASH.test(basis[key])))
      return null;
  }
  if (
    (payload.scopeComplete && basis.scopeDigest === null) ||
    (payload.evidenceCount > 0 && basis.evidenceDigest === null) ||
    (payload.progressPercent === null
      ? basis.metric !== 'unmeasured'
      : basis.metric !== assessment.metric ||
        basis.scopeDigest === null ||
        basis.modelDigest === null ||
        basis.evidenceDigest === null ||
        payload.evidenceCount === 0) ||
    (payload.evidenceCount === 0 &&
      (payload.readinessBand !== 'unknown' || payload.progressConfidence !== 'low')) ||
    (payload.remainingMinutesLow === null) !== (payload.remainingMinutesHigh === null) ||
    (payload.remainingMinutesLow !== null && basis.etaCalibrationDigest === null) ||
    // A delivery percentage cannot imply oral exam preparation/readiness.
    (assessment.metric === 'verified-requirements' && payload.readinessBand !== 'unknown')
  )
    return null;

  const json = JSON.stringify(payload);
  if (
    Buffer.byteLength(json, 'utf8') > 12 * 1024 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(json)
  )
    return null;
  const date = assessment.date ?? '';
  // Preserve the existing baseline fingerprint: timestamp is not content.
  const snapshotId =
    'vida2:assessment-progress:v1:' +
    closeoutHash(sorted([assessment.id, assessment.subjectId, date, payload]));
  const row: AssessmentCloseoutRow = [
    snapshotId,
    assessment.id,
    assessment.subjectId,
    date,
    input.generatedAt,
    json,
    'chatgpt_subject_project',
    'assessment-progress-v1',
  ];
  return {
    row,
    // Stable event identity is distinct from content: changed replay conflicts.
    intentId: closeoutHash([
      actorHash,
      assessment.subjectId,
      assessment.id,
      input.closeoutId,
      'assessment-progress-v1',
    ]),
    binding: closeoutHash([actorHash, writerHash, target, 'assessment-progress-v1']),
    digest: closeoutHash([
      row,
      sorted(basis),
      assessment.pasMainSha,
      assessment.dateSource,
      target,
      actorHash,
      writerHash,
    ]),
  };
}
