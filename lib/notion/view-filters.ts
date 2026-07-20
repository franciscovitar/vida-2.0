/**
 * Filtros y orden locales sobre DTO Notion (seguros para Client Components).
 */
import type {
  NotionProject,
  NotionProjectStatus,
  NotionTask,
  NotionTaskPriority,
  NotionTaskStatus,
} from '@/types/notion';

const PRIORITY_ORDER: Record<NotionTaskPriority, number> = {
  Alta: 0,
  Media: 1,
  Baja: 2,
};

export interface TaskFilterState {
  query: string;
  status: NotionTaskStatus | 'all';
  priority: NotionTaskPriority | 'all';
  areaId: string | 'all';
  projectId: string | 'all';
}

export interface ProjectFilterState {
  status: NotionProjectStatus | 'all';
  areaId: string | 'all';
  blocker: 'all' | 'with' | 'without';
  nextAction: 'all' | 'with' | 'without';
}

export function filterTasks(tasks: readonly NotionTask[], filters: TaskFilterState): NotionTask[] {
  const q = filters.query.trim().toLowerCase();
  return tasks
    .filter((task) => {
      if (q && !task.title.toLowerCase().includes(q)) return false;
      if (filters.status !== 'all' && task.status !== filters.status) return false;
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      if (filters.areaId !== 'all' && task.area?.id !== filters.areaId) return false;
      if (filters.projectId !== 'all' && task.project?.id !== filters.projectId) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = a.date ?? '9999-99-99';
      const dateB = b.date ?? '9999-99-99';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const pA = a.priority ? PRIORITY_ORDER[a.priority] : 9;
      const pB = b.priority ? PRIORITY_ORDER[b.priority] : 9;
      return pA - pB;
    });
}

export function filterProjects(
  projects: readonly NotionProject[],
  filters: ProjectFilterState,
): NotionProject[] {
  return projects.filter((project) => {
    if (filters.status !== 'all' && project.status !== filters.status) return false;
    if (filters.areaId !== 'all' && project.area?.id !== filters.areaId) return false;
    const hasBlocker = Boolean(project.blocker && project.blocker.trim() !== '');
    if (filters.blocker === 'with' && !hasBlocker) return false;
    if (filters.blocker === 'without' && hasBlocker) return false;
    const hasNext = Boolean(project.nextAction && project.nextAction.trim() !== '');
    if (filters.nextAction === 'with' && !hasNext) return false;
    if (filters.nextAction === 'without' && hasNext) return false;
    return true;
  });
}

export function relationLabel(
  relation: { name: string | null; available: boolean } | null,
): string {
  if (!relation) return 'Sin relación';
  if (!relation.available || relation.name === null) return 'Relación no disponible';
  return relation.name;
}
