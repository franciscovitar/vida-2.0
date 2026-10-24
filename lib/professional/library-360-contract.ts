import type {
  Library360Area,
  Library360CandidateReference,
  Library360Data,
  Library360Entry,
  Library360ResearchCase,
  Library360Snapshot,
} from '@/types/library-360';

const STATES = new Set(['CURRENT_STACK', 'ASSESS_NOW', 'WATCH', 'REFERENCE', 'HOLD', 'ARCHIVED']);
const ATTENTION = new Set(['NOW', 'WHEN_NEEDED', 'LIBRARY']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function isoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

function sourceReference(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    text(value.label) &&
    text(value.url) &&
    value.url.startsWith('https://') &&
    isoDate(value.verifiedAt)
  );
}

function entry(value: unknown): value is Library360Entry {
  if (!record(value)) return false;
  return (
    text(value.id) &&
    /^TL-\d{3}$/.test(value.id) &&
    [
      'name',
      'kind',
      'summary',
      'application',
      'benefit',
      'caution',
      'repository',
      'sourceUrl',
      'legacyCategoryId',
    ].every((key) => text(value[key])) &&
    (value.sourceUrl as string).startsWith('https://') &&
    STATES.has(value.status as string) &&
    ATTENTION.has(value.attention as string) &&
    strings(value.tags) &&
    (value.tags as string[]).length > 0 &&
    strings(value.relatedAreaIds) &&
    value.classificationStatus === 'PROPOSED_NOT_VERIFIED' &&
    Array.isArray(value.sourceReferences) &&
    value.sourceReferences.length > 0 &&
    value.sourceReferences.every(sourceReference)
  );
}

function area(value: unknown): value is Library360Area {
  if (!record(value)) return false;
  return (
    text(value.id) &&
    /^A(0[1-9]|1[0-2])_[A-Z0-9_]+$/.test(value.id) &&
    value.code === (value.id as string).slice(0, 3) &&
    text(value.label) &&
    value.researchStatus === 'EVIDENCE_READY_DOCUMENTARY_ONLY' &&
    text(value.researchReportPath) &&
    (value.researchReportPath as string).startsWith('AI/projects/professional-intelligence/') &&
    !(value.researchReportPath as string).includes('..') &&
    (value.researchReportPath as string).endsWith('.md') &&
    sha(value.researchReportBlobSha) &&
    Array.isArray(value.entries) &&
    value.entries.every(entry) &&
    strings(value.researchCases) &&
    strings(value.candidateReferences)
  );
}

function researchCase(value: unknown): value is Library360ResearchCase {
  if (!record(value)) return false;
  return (
    text(value.id) &&
    /^A(0[3-9]|1[01])-/.test(value.id) &&
    /^A(0[3-9]|1[01])$/.test(String(value.areaCode)) &&
    text(value.title) &&
    text(value.topic) &&
    (value.alternatives === null || text(value.alternatives)) &&
    (value.noChange === null || text(value.noChange)) &&
    (value.limitations === null || text(value.limitations)) &&
    (value.decision === null || text(value.decision)) &&
    (value.trialPlan === null || text(value.trialPlan)) &&
    value.trialStatus === 'NOT_RUN' &&
    value.adoptionStatus === 'NOT_AUTHORIZED' &&
    value.evidenceKind === 'DOCUMENTARY_RESEARCH_CASE' &&
    text(value.sourceUrl) &&
    value.sourceUrl.startsWith('https://') &&
    text(value.sourcePath) &&
    value.sourcePath.startsWith('AI/projects/professional-intelligence/') &&
    !value.sourcePath.includes('..') &&
    sha(value.sourceBlobSha) &&
    text(value.searchText)
  );
}

function candidateReference(value: unknown): value is Library360CandidateReference {
  if (!record(value)) return false;
  return (
    text(value.id) &&
    /^(A(01|02|12)-|OSS-)/.test(value.id) &&
    /^A(01|02|12)$/.test(String(value.area)) &&
    text(value.name) &&
    text(value.identity) &&
    text(value.referenceUrl) &&
    value.referenceUrl.startsWith('https://') &&
    text(value.subcategory) &&
    value.candidateStatus === 'CANDIDATE_PENDING_REVIEW' &&
    value.knowledgeStatus === 'DISCOVERED_NOT_VERIFIED' &&
    text(value.sourceScope) &&
    text(value.rightsStatus) &&
    value.testStatus === 'NOT_RUN' &&
    value.adoptionStatus === 'NOT_AUTHORIZED' &&
    text(value.sourcePath) &&
    value.sourcePath.startsWith('AI/projects/professional-intelligence/') &&
    !value.sourcePath.includes('..') &&
    sha(value.sourceBlobSha) &&
    isoDate(value.sourceCheckedAt) &&
    text(value.searchText)
  );
}

function mentionAudit(value: unknown): boolean {
  return (
    record(value) &&
    /^A(01|02|12)$/.test(String(value.area)) &&
    text(value.id) &&
    text(value.name) &&
    text(value.sourcePath) &&
    value.sourcePath.startsWith('AI/projects/professional-intelligence/') &&
    !value.sourcePath.includes('..') &&
    sha(value.sourceBlobSha) &&
    (value.identity === null || text(value.identity)) &&
    [
      'ATTACHED_TO_EXISTING_TL',
      'CANDIDATE_PENDING_REVIEW',
      'HOLD',
      'DEDUPLICATED_CANDIDATE_MENTION',
    ].includes(value.disposition as string) &&
    text(value.reason) &&
    (value.existingResourceId === undefined || /^TL-\d{3}$/.test(String(value.existingResourceId)))
  );
}

export function parseLibrary360Snapshot(value: unknown): Library360Snapshot | null {
  if (!record(value) || value.schemaVersion !== 3 || !record(value.source)) return null;
  const source = value.source;
  if (
    source.repository !== 'franciscovitar/personal-ai-system' ||
    source.ref !== 'main' ||
    !sha(source.commit) ||
    !sha(source.canonicalIndexBlobSha) ||
    !sha(source.crosswalkBlobSha) ||
    !sha(source.researchNavigationBlobSha) ||
    !Array.isArray(source.researchContentSources) ||
    !source.researchContentSources.every(
      (item) =>
        record(item) &&
        text(item.area) &&
        text(item.path) &&
        item.path.startsWith('AI/projects/professional-intelligence/') &&
        !item.path.includes('..') &&
        sha(item.blobSha),
    ) ||
    !sha(source.legacyDerivativeBlobSha) ||
    !sha(source.legacyDerivativeCommit) ||
    ![
      'generatedAt',
      'observedAt',
      'canonicalRef',
      'crosswalkRef',
      'researchNavigationRef',
      'legacyDerivativeRef',
      'provenanceNote',
    ].every((key) => text(source[key])) ||
    typeof source.staleAfterDays !== 'number' ||
    !Number.isFinite(source.staleAfterDays) ||
    source.staleAfterDays <= 0 ||
    typeof value.totalEntries !== 'number' ||
    !Number.isInteger(value.totalEntries) ||
    value.totalEntries < 1 ||
    !strings(value.spotlightIds) ||
    !Array.isArray(value.areas) ||
    value.areas.length !== 12 ||
    !value.areas.every(area) ||
    !Array.isArray(value.researchCases) ||
    value.researchCases.length !== 154 ||
    !value.researchCases.every(researchCase) ||
    !Array.isArray(value.candidateReferences) ||
    !value.candidateReferences.every(candidateReference) ||
    !Array.isArray(value.identityHolds) ||
    !value.identityHolds.every(
      (hold) =>
        record(hold) &&
        text(hold.id) &&
        text(hold.name) &&
        text(hold.area) &&
        (hold.repository === null || text(hold.repository)) &&
        text(hold.reason),
    ) ||
    !Array.isArray(value.researchMentionAudit) ||
    value.researchMentionAudit.length !== 356 ||
    !value.researchMentionAudit.every(mentionAudit) ||
    !record(value.researchReview)
  )
    return null;

  const review = value.researchReview;
  if (
    review.decision !== 'NO_COMMERCIAL_RIGHTS_OR_ADOPTION_CERTIFIED' ||
    review.sourceMentionCount !== 356 ||
    review.attachedToExistingResourceCount !== 42 ||
    review.candidateReferenceCount !== (value.candidateReferences as unknown[]).length ||
    review.candidateReferenceCount !== 272 ||
    review.holdCount !== 42 ||
    review.holdCount !==
      (value.researchMentionAudit as Record<string, unknown>[]).filter(
        (item) => item.disposition === 'HOLD',
      ).length ||
    review.deduplicatedMentionCount !==
      (value.researchMentionAudit as Record<string, unknown>[]).filter(
        (item) => item.disposition === 'DEDUPLICATED_CANDIDATE_MENTION',
      ).length ||
    review.sameRepositoryGroupsHeld !== 13 ||
    review.nameCollisionHolds !== 1
  )
    return null;

  const areas = value.areas as Library360Area[];
  const areaIds = areas.map((item) => item.id);
  if (new Set(areaIds).size !== 12) return null;
  const expectedCodes = Array.from({ length: 12 }, (_, i) => 'A' + String(i + 1).padStart(2, '0'));
  if (
    new Set(areas.map((item) => item.code)).size !== 12 ||
    !expectedCodes.every((code) => areas.some((item) => item.code === code))
  )
    return null;

  const allCases = value.researchCases as Library360ResearchCase[];
  const casesById = new Map(allCases.map((item) => [item.id, item]));
  const candidateRefs = value.candidateReferences as Library360CandidateReference[];
  const candidateIds = candidateRefs.map((item) => item.id);
  const candidateIdentities = candidateRefs.map((item) => item.identity.toLowerCase());
  if (
    new Set(casesById.keys()).size !== allCases.length ||
    new Set(candidateIds).size !== candidateIds.length ||
    new Set(candidateIdentities).size !== candidateIdentities.length ||
    candidateRefs.some((item) => item.adoptionStatus !== 'NOT_AUTHORIZED') ||
    candidateRefs.some((item) => !item.sourceScope) ||
    allCases.some(
      (item) =>
        !areas.some((area) => area.code === item.areaCode && area.researchCases.includes(item.id)),
    ) ||
    areas.flatMap((area) => area.researchCases).length !== allCases.length ||
    areas.flatMap((area) => area.candidateReferences).length !== candidateRefs.length ||
    candidateRefs.some(
      (item) =>
        !areas.some(
          (area) => area.code === item.area && area.candidateReferences.includes(item.id),
        ),
    )
  )
    return null;

  const knownAreas = new Set(areaIds);
  const resources = areas.flatMap((item) => item.entries);
  const ids = resources.map((item) => item.id);
  const repositories = resources.map((item) => item.repository.toLowerCase());
  if (
    resources.length !== value.totalEntries ||
    new Set(ids).size !== ids.length ||
    new Set(repositories).size !== repositories.length ||
    resources.some(
      (item) =>
        new Set(item.relatedAreaIds).size !== item.relatedAreaIds.length ||
        item.relatedAreaIds.some((id) => !knownAreas.has(id)),
    ) ||
    areas.some((item) => item.entries.some((resource) => resource.relatedAreaIds.includes(item.id)))
  )
    return null;

  const knownIds = new Set(ids);
  if (
    new Set(value.spotlightIds).size !== value.spotlightIds.length ||
    value.spotlightIds.some((id) => !knownIds.has(id))
  )
    return null;

  return value as unknown as Library360Snapshot;
}

export function resolveLibrary360Text(raw: string | null, now = new Date()): Library360Data {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'La Biblioteca 360° no está disponible.',
      stale: false,
      snapshot: null,
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'La Biblioteca 360° contiene JSON inválido.',
      stale: false,
      snapshot: null,
    };
  }
  const snapshot = parseLibrary360Snapshot(value);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'La Biblioteca 360° no cumple su contrato.',
      stale: false,
      snapshot: null,
    };
  }
  const observed = new Date(snapshot.source.observedAt + 'T00:00:00Z').getTime();
  const stale =
    Number.isNaN(observed) ||
    Math.max(0, now.getTime() - observed) > snapshot.source.staleAfterDays * 86400000;
  return {
    status: 'ready',
    notice: stale
      ? 'Los datos de las herramientas son históricos; verificá fuentes y condiciones antes de utilizarlas.'
      : null,
    stale,
    snapshot,
  };
}
