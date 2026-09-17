import type {
  NotionTaskDuration,
  NotionTaskEnergy,
  NotionTaskPriority,
  NotionTaskStatus,
} from '@/types/notion';

export type PlanningView = 'resumen' | 'semana' | 'tareas' | 'proyectos';

export interface PlanningTaskRelationOption {
  key: string;
  name: string;
  areaKey?: string | null;
}

export interface PlanningTaskEditableSnapshot {
  title: string;
  status: NotionTaskStatus;
  date: string | null;
  priority: NotionTaskPriority | null;
  duration: NotionTaskDuration | null;
  energy: NotionTaskEnergy | null;
  areaKey: string | null;
  projectKey: string | null;
  blocker: string | null;
  note: string | null;
}

export interface PlanningTaskItem extends PlanningTaskEditableSnapshot {
  key: string;
  areaName: string | null;
  projectName: string | null;
}

export interface PlanningTaskCatalog {
  tasks: readonly PlanningTaskItem[];
  areas: readonly PlanningTaskRelationOption[];
  projects: readonly PlanningTaskRelationOption[];
}

export interface PlanningTaskCreateInput {
  operationId: string;
  title: string;
  priority: NotionTaskPriority;
  areaKey: string;
  projectKey: string | null;
  date: string | null;
  duration: NotionTaskDuration | null;
  energy: NotionTaskEnergy | null;
  note: string | null;
}

export interface PlanningTaskUpdateInput {
  taskKey: string;
  expected: PlanningTaskEditableSnapshot;
  next: PlanningTaskEditableSnapshot;
}

export interface PlanningTaskArchiveInput {
  taskKey: string;
  expectedTitle: string;
  expectedStatus: NotionTaskStatus;
  confirmation: 'eliminar';
}

export type PlanningTaskMutationResult =
  | { ok: true; code: 'applied' | 'idempotent'; message: string }
  | {
      ok: false;
      code:
        | 'disabled'
        | 'invalid'
        | 'conflict'
        | 'not-found'
        | 'unavailable'
        | 'verification-failed';
      message: string;
    };
