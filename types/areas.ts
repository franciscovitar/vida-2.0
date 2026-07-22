/**
 * Contratos planos del panel de Áreas (8D.1).
 * Independientes de SDK Notion/Google. Sin IDs internos ni URLs privadas.
 */
import type { Domain } from '@/types';

export type AreaSlug = 'facultad' | 'genova-trabajo' | 'salud' | 'vida-personal';

export type AreaDataSourceKind = 'notion' | 'calendar' | 'sheets' | 'catalog';

export type AreaDataSourceState =
  'ready' | 'mock' | 'unavailable' | 'error' | 'not-applicable' | 'empty';

export interface AreaDataSourceStatus {
  kind: AreaDataSourceKind;
  state: AreaDataSourceState;
  notice: string | null;
}

export interface AreaSummary {
  slug: AreaSlug;
  stableKey: string;
  name: string;
  purpose: string | null;
  status: string;
  reviewDate: string | null;
  domain: Domain;
  activeProjectCount: number;
  pendingTaskCount: number;
  primaryFocus: string | null;
  href: string;
}

export interface AreaProjectSummary {
  /** Clave local opaca (no es UUID de Notion). */
  key: string;
  name: string;
  status: string;
  expectedResult: string | null;
  nextAction: string | null;
  blocker: string | null;
  dueDate: string | null;
  href: '/proyectos';
}

export interface AreaTaskSummary {
  key: string;
  title: string;
  status: string;
  date: string | null;
  dateKind: 'today' | 'overdue' | 'future' | 'none';
  duration: string | null;
  energy: string | null;
  projectName: string | null;
  blocker: string | null;
  href: '/tareas';
}

export interface AreaCalendarSummary {
  key: string;
  title: string;
  startLabel: string;
  endLabel: string | null;
  allDay: boolean;
  href: '/agenda';
}

export interface AreaMetricSummary {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  context: string | null;
  kind: 'confirmed' | 'trend' | 'coverage';
}

export type AreaIntegrityCode =
  | 'project-without-next-action'
  | 'task-area-mismatch'
  | 'blocked-project-without-blocker'
  | 'overdue-pending-task'
  | 'area-without-review-date'
  | 'incomplete-relation';

export interface AreaIntegrityWarning {
  code: AreaIntegrityCode;
  message: string;
  subject: string;
}

export interface AreaVariantFacultad {
  kind: 'facultad';
  studyHoursWeek: string | null;
  studyTrend: string | null;
  academicSections: readonly string[];
}

export interface AreaVariantTrabajo {
  kind: 'trabajo';
  workHoursWeek: string | null;
}

export interface AreaVariantSalud {
  kind: 'salud';
  sleepHours: string | null;
  energy: string | null;
  mood: string | null;
  exercise: string | null;
  coverage: string | null;
}

export interface AreaVariantPersonal {
  kind: 'personal';
  openPurchasesHint: string | null;
}

export type AreaVariantSection =
  AreaVariantFacultad | AreaVariantTrabajo | AreaVariantSalud | AreaVariantPersonal | null;

export interface AreaDashboardData {
  summary: AreaSummary;
  northHint: string | null;
  localContract: string | null;
  activeProjects: readonly AreaProjectSummary[];
  blockedProjects: readonly AreaProjectSummary[];
  pendingTasks: readonly AreaTaskSummary[];
  inProgressTasks: readonly AreaTaskSummary[];
  blockedTasks: readonly AreaTaskSummary[];
  upcomingTasks: readonly AreaTaskSummary[];
  overdueTasks: readonly AreaTaskSummary[];
  nextAction: string | null;
  calendar: readonly AreaCalendarSummary[];
  metrics: readonly AreaMetricSummary[];
  sources: readonly AreaDataSourceStatus[];
  integrity: readonly AreaIntegrityWarning[];
  variant: AreaVariantSection;
  targetDate: string;
}
