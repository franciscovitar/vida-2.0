/**
 * Contratos planos de Notion para la UI (Fase 4A).
 * Solo tipos JSON-serializables; sin cliente ni secretos.
 */
import type { Domain } from '@/types';

export type NotionDataSourceMode = 'mock' | 'notion';

export type NotionIntegrationStatus =
  | 'mock'
  | 'ready'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-data-source'
  | 'missing-property'
  | 'rate-limited'
  | 'network-error'
  | 'empty'
  | 'read-error';

export type NotionTaskStatus = 'Pendiente' | 'En progreso' | 'Bloqueada' | 'Hecha' | 'Algún día';

export type NotionTaskPriority = 'Alta' | 'Media' | 'Baja';

export type NotionTaskDuration = '5-15 min' | '30 min' | '1 h' | '2 h+';

export type NotionTaskEnergy = 'Baja' | 'Media' | 'Alta';

export type NotionProjectStatus = 'Activo' | 'En espera' | 'Bloqueado' | 'Completado' | 'Cancelado';

export type NotionAreaStatus = 'Activa' | 'En pausa' | 'Inactiva';

export type NotionDateKind = 'today' | 'overdue' | 'future' | 'none';

export interface NotionRelation {
  id: string;
  name: string | null;
  available: boolean;
}

export interface NotionTask {
  id: string;
  title: string;
  status: NotionTaskStatus;
  date: string | null;
  dateKind: NotionDateKind;
  priority: NotionTaskPriority | null;
  duration: NotionTaskDuration | null;
  energy: NotionTaskEnergy | null;
  project: NotionRelation | null;
  area: NotionRelation | null;
  projectArea: NotionRelation | null;
  blocker: string | null;
  note: string | null;
  domain: Domain;
}

export interface NotionProject {
  id: string;
  name: string;
  status: NotionProjectStatus;
  area: NotionRelation | null;
  expectedResult: string | null;
  nextAction: string | null;
  dueDate: string | null;
  dateKind: NotionDateKind;
  reviewDate: string | null;
  blocker: string | null;
  relatedTaskCount: number;
  domain: Domain;
}

export interface NotionArea {
  id: string;
  name: string;
  status: NotionAreaStatus;
  purpose: string | null;
  reviewDate: string | null;
  relatedProjectCount: number;
  relatedTaskCount: number;
  domain: Domain;
}

export interface NotionTaskSummary {
  pending: number;
  inProgress: number;
  blocked: number;
  done: number;
  someday: number;
  overdue: number;
  dueToday: number;
  total: number;
}

export interface NotionProjectSummary {
  active: number;
  waiting: number;
  blocked: number;
  completed: number;
  cancelled: number;
  overdue: number;
  withoutNextAction: number;
  total: number;
}

export interface NotionDashboardData {
  source: NotionDataSourceMode;
  status: NotionIntegrationStatus;
  notice: string | null;
  syncedAt: string;
  targetDate: string;
  tasks: NotionTask[];
  projects: NotionProject[];
  areas: NotionArea[];
  taskSummary: NotionTaskSummary;
  projectSummary: NotionProjectSummary;
}

/** Vista compacta de tarea para Hoy (sin IDs de data source). */
export interface HoyTaskView {
  id: string;
  title: string;
  status: NotionTaskStatus;
  priority: NotionTaskPriority | null;
  duration: NotionTaskDuration | null;
  energy: NotionTaskEnergy | null;
  date: string | null;
  areaName: string | null;
  projectName: string | null;
  blocker: string | null;
  relationUnavailable: boolean;
}

export interface HoyProjectView {
  id: string;
  name: string;
  areaName: string | null;
  expectedResult: string | null;
  nextAction: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  relatedTaskCount: number;
  blocker: string | null;
  withoutNextAction: boolean;
  blocked: boolean;
  dueSoon: boolean;
  relationUnavailable: boolean;
}

export interface HoySuggestedAction {
  id: string;
  title: string;
  reason: string;
  href: '/tareas' | '/proyectos' | '/agenda?view=today';
}

export interface HoyNotionSummary {
  dueToday: number;
  overdue: number;
  inProgress: number;
  blocked: number;
  activeProjects: number;
  withoutNextAction: number;
}

/** Bloque Notion de la pantalla Hoy. */
export interface HoyNotionView {
  status: NotionIntegrationStatus;
  source: NotionDataSourceMode;
  notice: string | null;
  dueToday: HoyTaskView[];
  overdue: HoyTaskView[];
  inProgress: HoyTaskView[];
  blocked: HoyTaskView[];
  activeProjects: HoyProjectView[];
  summary: HoyNotionSummary;
  suggestedActions: HoySuggestedAction[];
}

/**
 * Preview liviano (compatible con getNotionHoyPreview).
 */
export interface NotionHoyPreview {
  tasksDueToday: NotionTask[];
  overdueTasks: NotionTask[];
  activeProjects: NotionProject[];
  blockedProjects: NotionProject[];
  primaryNextAction: string | null;
}
