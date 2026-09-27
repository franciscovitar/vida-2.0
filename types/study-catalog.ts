import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';

export type StudyCatalogLoadState =
  | 'ready'
  | 'degraded'
  | 'unconfigured'
  | 'unavailable'
  | 'invalid';

export type StudySubjectStructureStatus = 'resolved' | 'partial' | 'unresolved';

export interface StudyCatalogStudySet {
  id: string;
  label: string;
  channel: 'theory' | 'practice' | 'content';
  sequence: string | null;
}

export interface StudyCatalogTopic {
  id: string;
  label: string;
  conceptCount: number | null;
  studySets: readonly StudyCatalogStudySet[];
}

export interface StudyCatalogAssessment {
  id: string;
  status: string | null;
  date: string | null;
  format: string | null;
  scopeComplete: boolean;
}

export interface StudyCatalogSubject {
  id: string;
  name: string;
  term: string | null;
  currentUnit: string | null;
  assessment: StudyCatalogAssessment | null;
  structureStatus: StudySubjectStructureStatus;
  sourceScopeStatus: string | null;
  conceptCount: number;
  topics: readonly StudyCatalogTopic[];
  readinessBand: string | null;
  updated: string | null;
}

export interface StudyCatalogSnapshot {
  schemaVersion: 1;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    generatedAt: string;
    canonicalRoot: 'AI/projects/university/subjects';
  };
  subjects: readonly StudyCatalogSubject[];
}

export interface StudyCatalogRead {
  state: StudyCatalogLoadState;
  subjects: readonly StudyCatalogSubject[];
  notice: string | null;
  sourceCommit: string | null;
}

export interface StudySubjectWithProgress extends StudyCatalogSubject {
  progress: AssessmentProgressSnapshot | null;
}
