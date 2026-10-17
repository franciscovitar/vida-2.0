export type AssessmentProgressConfidence = 'low' | 'medium' | 'high';
export type AssessmentReadinessBand =
  'not-ready' | 'developing' | 'close' | 'exam-ready' | 'unknown';
export type AssessmentLifecycleStatus = 'planned' | 'active' | 'complete' | 'cancelled';
export type AssessmentProgressVersion = 'assessment-progress-v1' | 'assessment-progress-v2';

/** Estimación del ChatGPT Project de materia; nunca reemplaza progressPercent. */
export interface AssessmentPreparationEstimate {
  percent: number;
  confidence: AssessmentProgressConfidence;
  asOf: string;
  basis: string;
  rangeLow: number | null;
  rangeHigh: number | null;
}

export interface AssessmentProgressPayload {
  name: string;
  type: string;
  status: AssessmentLifecycleStatus;
  /** null = todavía no medible; nunca significa 0. */
  progressPercent: number | null;
  progressConfidence: AssessmentProgressConfidence;
  readinessBand: AssessmentReadinessBand;
  remainingMinutesLow: number | null;
  remainingMinutesHigh: number | null;
  etaConfidence: AssessmentProgressConfidence;
  criticalGaps: readonly string[];
  nextBestActivity: string | null;
  scopeComplete: boolean;
  evidenceCount: number;
  /** Solo V2. Ausente en filas históricas V1. */
  preparationEstimate?: AssessmentPreparationEstimate | null;
}

export interface AssessmentProgressSnapshot {
  snapshotId: string;
  assessmentId: string;
  subjectId: string;
  assessmentDate: string | null;
  generatedAt: string;
  payload: AssessmentProgressPayload;
}

export type AssessmentProgressReadStatus =
  'ready' | 'degraded' | 'empty' | 'invalid' | 'unavailable';

export interface AssessmentProgressRead {
  status: AssessmentProgressReadStatus;
  snapshots: readonly AssessmentProgressSnapshot[];
  notice: string | null;
  invalidRows: number;
}
