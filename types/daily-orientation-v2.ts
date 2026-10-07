import type { DailyPlanningStatus } from '@/types/daily-planning-intelligence';

export type DailyOrientationDomain =
  | 'university'
  | 'projects'
  | 'professional'
  | 'tasks'
  | 'gym'
  | 'health'
  | 'nutrition'
  | 'personal'
  | 'other';

export type DailyOrientationEvidenceState =
  | 'VERIFIED'
  | 'SUPPORTED'
  | 'DECLARED'
  | 'PARTIAL'
  | 'UNVERIFIED'
  | 'CONFLICT'
  | 'UNKNOWN';

export type DailyOrientationProgressEffect =
  | 'none'
  | 'possible'
  | 'verified'
  | 'conflict'
  | 'unknown';

export type DailyOrientationConfidence = 'Alta' | 'Media' | 'Baja';

export interface DailyOrientationReviewItem {
  domain: DailyOrientationDomain;
  activity: string;
  evidenceState: DailyOrientationEvidenceState;
  progressEffect: DailyOrientationProgressEffect;
  summary: string;
}

export interface DailyOrientationReview {
  date: string;
  headline: string;
  items: DailyOrientationReviewItem[];
  uncertainties: string[];
}

export type DailyOrientationTargetKind =
  | 'subject'
  | 'assessment'
  | 'project'
  | 'task'
  | 'recovery'
  | 'none';

export interface DailyOrientationAttentionItem {
  domain: Exclude<DailyOrientationDomain, 'nutrition'>;
  targetKind: DailyOrientationTargetKind;
  ref: string | null;
  title: string;
  recommendation: string;
  why: string;
  confidence: DailyOrientationConfidence;
  nextAction: string | null;
}

export type DailyOrientationUpcomingKind = 'calendar' | 'task' | 'assessment' | 'project';

export type DailyOrientationDateType =
  | 'deadline'
  | 'target'
  | 'review'
  | 'event'
  | 'assessment'
  | 'unknown';

export interface DailyOrientationUpcomingItem {
  kind: DailyOrientationUpcomingKind;
  ref: string | null;
  title: string;
  date: string;
  dateType: DailyOrientationDateType;
  reason: string;
}

export type DailyOrientationLifeSignalKind =
  | 'sleep'
  | 'recovery'
  | 'movement'
  | 'leisure'
  | 'social'
  | 'capacity'
  | 'other';

export type DailyOrientationLifeSignalLevel =
  | 'normal'
  | 'notice'
  | 'candidate-pattern'
  | 'unknown';

export interface DailyOrientationLifeSignal {
  kind: DailyOrientationLifeSignalKind;
  level: DailyOrientationLifeSignalLevel;
  summary: string;
  confidence: DailyOrientationConfidence;
}

export interface DailyOrientationFocusItem {
  domain: DailyOrientationDomain;
  title: string;
  why: string;
  ref: string | null;
}

export interface DailyOrientationPayload {
  review: DailyOrientationReview;
  attention: DailyOrientationAttentionItem[];
  upcoming: DailyOrientationUpcomingItem[];
  lifeSignals: DailyOrientationLifeSignal[];
  minimum: DailyOrientationFocusItem[];
  notNow: DailyOrientationFocusItem[];
}

export interface DailyOrientationSnapshot {
  id: string;
  planDate: string;
  generatedAt: string;
  payload: DailyOrientationPayload;
}

export type DailyOrientationReadStatus = 'ready' | 'empty' | 'invalid' | 'unavailable';

export interface DailyOrientationSnapshotRead {
  status: DailyOrientationReadStatus;
  snapshot: DailyOrientationSnapshot | null;
  notice: string | null;
  invalidRows: number;
}

/** Browser-safe view: no Snapshot ID or canonical refs. */
export interface DailyOrientationViewAttentionItem {
  domain: Exclude<DailyOrientationDomain, 'nutrition'>;
  targetKind: DailyOrientationTargetKind;
  title: string;
  recommendation: string;
  why: string;
  confidence: DailyOrientationConfidence;
  nextAction: string | null;
}

export interface DailyOrientationViewUpcomingItem {
  kind: DailyOrientationUpcomingKind;
  title: string;
  date: string;
  dateType: DailyOrientationDateType;
  reason: string;
}

export interface DailyOrientationViewFocusItem {
  domain: DailyOrientationDomain;
  title: string;
  why: string;
}

export interface DailyOrientationView {
  status: DailyPlanningStatus;
  notice: string | null;
  targetDate: string;
  generatedAt: string | null;
  review: DailyOrientationReview | null;
  attention: DailyOrientationViewAttentionItem[];
  upcoming: DailyOrientationViewUpcomingItem[];
  lifeSignals: DailyOrientationLifeSignal[];
  minimum: DailyOrientationViewFocusItem[];
  notNow: DailyOrientationViewFocusItem[];
  quality: {
    unresolvedRefs: number;
    invalidRows: number;
  };
}
