import type { TechnologyLibraryEntry } from '@/types/technology-library';

export interface Library360Entry extends TechnologyLibraryEntry {
  legacyCategoryId: string;
  relatedAreaIds: readonly string[];
  classificationStatus: 'PROPOSED_NOT_VERIFIED';
}

export interface Library360Area {
  id: string;
  code: string;
  label: string;
  researchStatus: 'EVIDENCE_READY_DOCUMENTARY_ONLY';
  researchReportPath: string;
  researchReportBlobSha: string;
  entries: readonly Library360Entry[];
}

export interface Library360Snapshot {
  schemaVersion: 2;
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
    legacyDerivativeRef: string;
    legacyDerivativeBlobSha: string;
    legacyDerivativeCommit: string;
    provenanceNote: string;
  };
  totalEntries: number;
  spotlightIds: readonly string[];
  areas: readonly Library360Area[];
}

export interface Library360Data {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: Library360Snapshot | null;
}
