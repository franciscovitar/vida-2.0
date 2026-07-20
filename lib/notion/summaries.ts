/**
 * Resúmenes y vista previa Hoy a partir de DTO Notion.
 */
import { isProjectOverdueActive, isTaskOverdue } from '@/lib/notion/classify';
import type {
  NotionDashboardData,
  NotionHoyPreview,
  NotionProject,
  NotionProjectSummary,
  NotionTask,
  NotionTaskSummary,
} from '@/types/notion';

export function summarizeTasks(tasks: readonly NotionTask[]): NotionTaskSummary {
  const summary: NotionTaskSummary = {
    pending: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    someday: 0,
    overdue: 0,
    dueToday: 0,
    total: tasks.length,
  };
  for (const task of tasks) {
    if (task.status === 'Pendiente') summary.pending += 1;
    if (task.status === 'En progreso') summary.inProgress += 1;
    if (task.status === 'Bloqueada') summary.blocked += 1;
    if (task.status === 'Hecha') summary.done += 1;
    if (task.status === 'Algún día') summary.someday += 1;
    if (isTaskOverdue(task.dateKind, task.status)) summary.overdue += 1;
    if (task.dateKind === 'today' && task.status !== 'Hecha') summary.dueToday += 1;
  }
  return summary;
}

export function summarizeProjects(projects: readonly NotionProject[]): NotionProjectSummary {
  const summary: NotionProjectSummary = {
    active: 0,
    waiting: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    overdue: 0,
    withoutNextAction: 0,
    total: projects.length,
  };
  for (const project of projects) {
    if (project.status === 'Activo') summary.active += 1;
    if (project.status === 'En espera') summary.waiting += 1;
    if (project.status === 'Bloqueado') summary.blocked += 1;
    if (project.status === 'Completado') summary.completed += 1;
    if (project.status === 'Cancelado') summary.cancelled += 1;
    if (isProjectOverdueActive(project.dateKind, project.status)) summary.overdue += 1;
    if (
      (project.status === 'Activo' ||
        project.status === 'En espera' ||
        project.status === 'Bloqueado') &&
      (project.nextAction === null || project.nextAction.trim() === '')
    ) {
      summary.withoutNextAction += 1;
    }
  }
  return summary;
}

/** Contrato listo para Hoy; todavía no se renderiza en la UI. */
export function buildNotionHoyPreview(data: NotionDashboardData): NotionHoyPreview {
  const tasksDueToday = data.tasks.filter(
    (task) => task.dateKind === 'today' && task.status !== 'Hecha',
  );
  const overdueTasks = data.tasks.filter((task) => isTaskOverdue(task.dateKind, task.status));
  const activeProjects = data.projects.filter((project) => project.status === 'Activo');
  const blockedProjects = data.projects.filter(
    (project) =>
      project.status === 'Bloqueado' || (project.blocker !== null && project.blocker !== ''),
  );
  const primaryNextAction =
    activeProjects.find((project) => project.nextAction)?.nextAction ??
    tasksDueToday[0]?.title ??
    null;

  return {
    tasksDueToday,
    overdueTasks,
    activeProjects,
    blockedProjects,
    primaryNextAction,
  };
}
