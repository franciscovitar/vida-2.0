import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';
import type { NotionProject, NotionTask } from '@/types/notion';
import type { ProjectsIntelligenceProject } from '@/types/projects-intelligence';

function dateValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function closedProjectIds(projects: readonly NotionProject[]): Set<string> {
  return new Set(
    projects
      .filter((project) => project.status === 'Completado' || project.status === 'Cancelado')
      .map((project) => project.id),
  );
}

function taskCompetesForPlanning(task: NotionTask, closedProjects: ReadonlySet<string>): boolean {
  if (task.status === 'Hecha' || task.status === 'Algún día') return false;
  if (task.project?.available && closedProjects.has(task.project.id)) return false;
  return true;
}

export function selectPlanningAssessments(
  snapshots: readonly AssessmentProgressSnapshot[],
): AssessmentProgressSnapshot[] {
  return snapshots
    .filter((item) => item.payload.status === 'active' || item.payload.status === 'planned')
    .sort((a, b) => {
      const byDate = dateValue(a.assessmentDate) - dateValue(b.assessmentDate);
      if (byDate !== 0) return byDate;
      return a.payload.name.localeCompare(b.payload.name, 'es');
    });
}

export function selectAttentionTasks(
  tasks: readonly NotionTask[],
  projects: readonly NotionProject[],
  limit = 8,
): NotionTask[] {
  const rankStatus = (task: NotionTask): number => {
    if (task.status === 'Bloqueada') return 0;
    if (task.dateKind === 'overdue') return 1;
    if (task.dateKind === 'today') return 2;
    if (task.status === 'En progreso') return 3;
    if (task.priority === 'Alta') return 4;
    return 5;
  };

  const closedProjects = closedProjectIds(projects);

  return tasks
    .filter((task) => taskCompetesForPlanning(task, closedProjects))
    .sort((a, b) => {
      const byStatus = rankStatus(a) - rankStatus(b);
      if (byStatus !== 0) return byStatus;
      const byDate = dateValue(a.date) - dateValue(b.date);
      if (byDate !== 0) return byDate;
      return a.title.localeCompare(b.title, 'es');
    })
    .slice(0, limit);
}

export function selectPlanningProjects(
  projects: readonly ProjectsIntelligenceProject[],
): ProjectsIntelligenceProject[] {
  return projects
    .filter((project) => project.status === 'Activo' || project.status === 'Bloqueado')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Bloqueado' ? -1 : 1;
      const byDeadline = dateValue(a.dueDate) - dateValue(b.dueDate);
      if (byDeadline !== 0) return byDeadline;
      return a.name.localeCompare(b.name, 'es');
    });
}

export function selectWeekTasks(
  tasks: readonly NotionTask[],
  projects: readonly NotionProject[],
  targetDate: string,
  horizonDays = 7,
): NotionTask[] {
  const start = Date.parse(`${targetDate}T12:00:00Z`);
  const end = start + horizonDays * 86_400_000;
  const closedProjects = closedProjectIds(projects);

  return tasks
    .filter((task) => {
      if (!taskCompetesForPlanning(task, closedProjects) || !task.date) return false;
      const date = Date.parse(`${task.date}T12:00:00Z`);
      return Number.isFinite(date) && date >= start && date < end;
    })
    .sort((a, b) => dateValue(a.date) - dateValue(b.date));
}
