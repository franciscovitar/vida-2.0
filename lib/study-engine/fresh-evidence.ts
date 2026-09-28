import type { StudyAttemptEvent } from './attempt-store';
import { ratingRepresentsSuccessfulRecall } from './scheduler';

export const FRESH_EVIDENCE_HEADERS = [
  'timestamp',
  'subject_id',
  'assessment',
  'concept_id',
  'activity_id',
  'source',
  'operation',
  'score',
  'correct',
  'seen_before',
  'independent',
  'delayed_days',
  'confidence',
  'minutes',
  'error_type',
  'variant_family',
  'notes',
  'evidence_id',
] as const;

export const CONCEPT_INVENTORY_HEADERS = [
  'concept_id',
  'subject_id',
  'assessment',
  'unit',
  'parent_id',
  'name',
  'description',
  'importance',
] as const;

export type FreshEvidenceCell = string | number | boolean;
export type FreshEvidenceRow = readonly FreshEvidenceCell[];

export interface LearningConceptMapping {
  conceptId: string;
  subjectId: string;
  assessment: string;
}

export type StudyEvidenceMappingResult =
  | { status: 'mapped'; row: FreshEvidenceRow; evidenceId: string }
  | { status: 'unmapped'; reason: 'missing-concept' | 'subject-mismatch' };

function comparable(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function headersMatch(
  actual: readonly unknown[] | undefined,
  expected: readonly string[],
): boolean {
  if (!actual || actual.length < expected.length) return false;
  return expected.every((name, index) => comparable(actual[index]) === name);
}

export function parseConceptMappings(
  values: readonly (readonly unknown[])[],
): LearningConceptMapping[] {
  if (!headersMatch(values[0], CONCEPT_INVENTORY_HEADERS)) return [];

  const rows: LearningConceptMapping[] = [];
  for (const row of values.slice(1)) {
    const conceptId = comparable(row[0]);
    const subjectId = comparable(row[1]);
    const assessment = comparable(row[2]);
    if (!conceptId || !subjectId || !assessment) continue;
    rows.push({ conceptId, subjectId, assessment });
  }
  return rows;
}

function evidenceConfidence(attempt: StudyAttemptEvent): number {
  let value = 0.72;
  if (attempt.helpLevel === 'independent') value += 0.06;
  if (attempt.contextFreshness !== 'familiar') value += 0.04;
  if (attempt.correctness !== null) value += 0.04;
  return Math.min(0.86, Number(value.toFixed(2)));
}

function delayedDays(attempt: StudyAttemptEvent): number | '' {
  if (attempt.contextFreshness !== 'delayed' || !attempt.schedulerStateBefore?.lastReview) {
    return '';
  }

  const last = Date.parse(attempt.schedulerStateBefore.lastReview);
  const now = Date.parse(attempt.answeredAt);
  if (!Number.isFinite(last) || !Number.isFinite(now) || now < last) return '';
  return Number(((now - last) / 86_400_000).toFixed(2));
}

function resultFor(attempt: StudyAttemptEvent): 'supports' | 'weakens' | 'uncertain' {
  if (attempt.correctness === true) return 'supports';
  if (attempt.correctness === false) return 'weakens';
  return ratingRepresentsSuccessfulRecall(attempt.rating) ? 'supports' : 'weakens';
}

function correctFor(attempt: StudyAttemptEvent): boolean {
  return attempt.correctness ?? ratingRepresentsSuccessfulRecall(attempt.rating);
}

function notesFor(attempt: StudyAttemptEvent): string {
  const notes = [
    `channel=${attempt.channel}`,
    `result=${resultFor(attempt)}`,
    `help=${attempt.helpLevel}`,
    `freshness=${attempt.contextFreshness}`,
    `attempt_id=${attempt.id}`,
    `session=${attempt.sessionId}`,
    `response_ms=${attempt.responseTimeMs}`,
  ];
  if (attempt.reviewUnitId) notes.push(`review_unit=${attempt.reviewUnitId}`);
  if (attempt.facetId) notes.push(`facet_id=${attempt.facetId}`);
  if (attempt.modeRole) notes.push(`mode_role=${attempt.modeRole}`);
  if (attempt.interaction) notes.push(`interaction=${attempt.interaction}`);
  if (attempt.evidenceCeiling) notes.push(`evidence_ceiling=${attempt.evidenceCeiling}`);
  return notes.join(';');
}

export function mapStudyAttemptToFreshEvidence(
  attempt: StudyAttemptEvent,
  mappings: readonly LearningConceptMapping[],
): StudyEvidenceMappingResult {
  const candidateIds = [attempt.facetId, attempt.conceptId].filter((value): value is string =>
    Boolean(value),
  );
  const mapping = candidateIds
    .map((candidate) => mappings.find((entry) => entry.conceptId === candidate))
    .find((entry): entry is LearningConceptMapping => Boolean(entry));
  if (!mapping) return { status: 'unmapped', reason: 'missing-concept' };
  const mappedConceptId = mapping.conceptId;

  if (mapping.subjectId.toLocaleLowerCase('es') !== attempt.subjectId.toLocaleLowerCase('es')) {
    return { status: 'unmapped', reason: 'subject-mismatch' };
  }

  const evidenceId = `study-engine:${attempt.id}`;
  const activityId = `study-engine:${attempt.sessionId}:${attempt.studyItemId}`;

  const row: FreshEvidenceRow = [
    attempt.answeredAt,
    mapping.subjectId,
    mapping.assessment,
    mappedConceptId,
    activityId,
    'study_engine',
    attempt.operation,
    '',
    correctFor(attempt),
    attempt.seenBefore,
    attempt.helpLevel === 'independent',
    delayedDays(attempt),
    evidenceConfidence(attempt),
    '',
    '',
    attempt.variantFamily ?? '',
    notesFor(attempt),
    evidenceId,
  ];

  return { status: 'mapped', row, evidenceId };
}

export function sameFreshEvidenceRow(left: readonly unknown[], right: readonly unknown[]): boolean {
  if (left.length < FRESH_EVIDENCE_HEADERS.length || right.length < FRESH_EVIDENCE_HEADERS.length) {
    return false;
  }
  return FRESH_EVIDENCE_HEADERS.every(
    (_header, index) => comparable(left[index]) === comparable(right[index]),
  );
}
