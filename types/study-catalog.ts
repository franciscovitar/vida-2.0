import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';

export type StudyCatalogLoadState =
  'ready' | 'degraded' | 'unconfigured' | 'unavailable' | 'invalid';

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
  id: string | null;
  label?: string | null;
  status: string | null;
  date: string | null;
  dateEvidence?: string | null;
  format: string | null;
  scopeComplete: boolean;
  deliveryDate?: string | null;
  deliveryEvidence?: string | null;
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
  studyRuntimeAvailable: boolean;
}

export interface StudyCatalogRead {
  state: StudyCatalogLoadState;
  subjects: readonly StudyCatalogSubject[];
  notice: string | null;
  sourceCommit: string | null;
}

export interface StudySubjectWithProgress extends StudyCatalogSubject {
  progress: AssessmentProgressSnapshot | null;
  /** Derived conflict/age hint, separate from underlying evidence freshness. */
  evidenceNotice: string | null;
}
