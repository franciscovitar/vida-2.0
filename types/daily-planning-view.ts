import type { DailyPlanningStatus } from '@/types/daily-planning-intelligence';

export type DailyPlanItemKind = 'task' | 'project' | 'calendar' | 'derived';

export interface DailyPlanSnapshotItem {
  kind: DailyPlanItemKind;
  ref: string | null;
  activity: string | null;
  reason: string;
}

export interface DailyPlanSnapshotBlock {
  start: string;
  end: string;
  item: DailyPlanSnapshotItem;
}

export interface DailyPlanSnapshotPayload {
  must: DailyPlanSnapshotItem[];
  should: DailyPlanSnapshotItem[];
  could: DailyPlanSnapshotItem[];
  notToday: DailyPlanSnapshotItem[];
  suggestedBlocks: DailyPlanSnapshotBlock[];
  minimumViable: DailyPlanSnapshotItem[];
}

/** Snapshot interno server-side. Snapshot ID nunca sale al DTO de UI. */
export interface DailyPlanSnapshot {
  id: string;
  planDate: string;
  generatedAt: string;
  payload: DailyPlanSnapshotPayload;
}

export type DailyPlanSnapshotReadStatus = 'ready' | 'empty' | 'invalid' | 'unavailable';

export interface DailyPlanSnapshotRead {
  status: DailyPlanSnapshotReadStatus;
  snapshot: DailyPlanSnapshot | null;
  notice: string | null;
  invalidRows: number;
}

export interface DailyPlanningViewItem {
  title: string;
  reason: string;
  meta: string | null;
}

export interface DailyPlanningViewBlock {
  start: string;
  end: string;
  item: DailyPlanningViewItem;
}

export interface DailyPlanningCommitmentView {
  title: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
}

export interface DailyPlanningDateMarkerView {
  title: string;
  date: string;
  note: string | null;
}

export interface DailyPlanningBlockedView {
  title: string;
  blocker: string | null;
}

export interface DailyPlanningSourceView {
  label: 'Plan' | 'Tareas' | 'Proyectos' | 'Hitos' | 'Calendar';
  status: string;
  available: boolean;
  notice: string | null;
}

export interface DailyPlanningViewQuality {
  unresolvedPlanRefs: number;
  ambiguousTaskDates: number;
  missingTaskDurations: number;
  missingTaskPriorities: number;
  calendarDateConflicts: number;
}

export interface DailyPlanningView {
  status: DailyPlanningStatus;
  notice: string | null;
  targetDate: string;
  planGeneratedAt: string | null;
  contextSyncedAt: string;
  timezone: string;
  fixedCommitments: DailyPlanningCommitmentView[];
  dateMarkers: DailyPlanningDateMarkerView[];
  must: DailyPlanningViewItem[];
  should: DailyPlanningViewItem[];
  could: DailyPlanningViewItem[];
  notToday: DailyPlanningViewItem[];
  suggestedBlocks: DailyPlanningViewBlock[];
  minimumViable: DailyPlanningViewItem[];
  blockedTasks: DailyPlanningBlockedView[];
  pendingCount: number;
  sources: DailyPlanningSourceView[];
  quality: DailyPlanningViewQuality;
}
