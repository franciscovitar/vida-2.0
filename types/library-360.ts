import type { TechnologyLibraryEntry } from '@/types/technology-library';

export interface Library360SourceReference {
  label: string;
  url: string;
  verifiedAt: string;
}

export interface Library360Entry extends TechnologyLibraryEntry {
  legacyCategoryId: string;
  relatedAreaIds: readonly string[];
  classificationStatus: 'PROPOSED_NOT_VERIFIED';
  sourceReferences: readonly Library360SourceReference[];
  researchMentionRefs?: readonly {
    sourceId: string;
    sourcePath: string;
    sourceBlobSha: string;
    sourceCheckedAt: string;
    disposition: 'ATTACHED_TO_EXISTING_TL';
  }[];
}

export interface Library360Area {
  id: string;
  code: string;
  label: string;
  researchStatus: 'EVIDENCE_READY_DOCUMENTARY_ONLY';
  researchReportPath: string;
  researchReportBlobSha: string;
  entries: readonly Library360Entry[];
  researchCases: readonly string[];
  candidateReferences: readonly string[];
}

export interface Library360ResearchCase {
  id: string;
  areaCode: string;
  title: string;
  topic: string;
  alternatives: string | null;
  noChange: string | null;
  limitations: string | null;
  decision: string | null;
  trialPlan: string | null;
  trialStatus: 'NOT_RUN';
  adoptionStatus: 'NOT_AUTHORIZED';
  evidenceKind: 'DOCUMENTARY_RESEARCH_CASE';
  sourceUrl: string;
  sourcePath: string;
  sourceBlobSha: string;
  searchText: string;
}

export interface Library360CandidateReference {
  id: string;
  area: string;
  name: string;
  identity: string;
  referenceUrl: string;
  subcategory: string;
  candidateStatus: 'CANDIDATE_PENDING_REVIEW';
  knowledgeStatus: 'DISCOVERED_NOT_VERIFIED';
  sourceScope: string;
  rightsStatus: string;
  testStatus: string;
  adoptionStatus: 'NOT_AUTHORIZED';
  sourcePath: string;
  sourceBlobSha: string;
  sourceCheckedAt: string;
  searchText: string;
  [key: string]: unknown;
}

export interface Library360MentionAudit {
  area: string;
  id: string;
  name: string;
  sourcePath: string;
  sourceBlobSha: string;
  identity: string | null;
  disposition:
    | 'ATTACHED_TO_EXISTING_TL'
    | 'CANDIDATE_PENDING_REVIEW'
    | 'HOLD'
    | 'DEDUPLICATED_CANDIDATE_MENTION';
  reason: string;
  existingResourceId?: string;
}

export interface Library360Snapshot {
  schemaVersion: 3;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
    canonicalRef: string;
    canonicalIndexBlobSha: string;
    crosswalkRef: string;
    crosswalkBlobSha: string;
    researchNavigationRef: string;
    researchNavigationBlobSha: string;
    researchContentSources: readonly { area: string; path: string; blobSha: string }[];
    legacyDerivativeRef: string;
    legacyDerivativeBlobSha: string;
    legacyDerivativeCommit: string;
    provenanceNote: string;
  };
  totalEntries: number;
  spotlightIds: readonly string[];
  areas: readonly Library360Area[];
  researchCases: readonly Library360ResearchCase[];
  candidateReferences: readonly Library360CandidateReference[];
  identityHolds: readonly {
    id: string;
    name: string;
    area: string;
    repository: string | null;
    reason: string;
  }[];
  researchMentionAudit: readonly Library360MentionAudit[];
  researchReview: {
    sourceMentionCount: number;
    attachedToExistingResourceCount: number;
    candidateReferenceCount: number;
    holdCount: number;
    deduplicatedMentionCount: number;
    sameRepositoryGroupsHeld: number;
    nameCollisionHolds: number;
    decision: 'NO_COMMERCIAL_RIGHTS_OR_ADOPTION_CERTIFIED';
  };
}

export interface Library360Data {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: Library360Snapshot | null;
}
