/**
 * Vistas Notion para la pantalla Hoy (determinísticas, sin IA).
 * Calendar solo filtra incompatibles por tiempo libre; no convierte eventos en tareas.
 */
import { addDaysYmd } from '@/lib/adapters/dates';
import { isCalendarHoyUnavailable } from '@/lib/calendar/errors';
import { isTaskOverdue } from '@/lib/notion/classify';
import type { CalendarTodayPreview } from '@/types/calendar';
import type {
  HoyNotionView,
  HoyProjectView,
  HoySuggestedAction,
  HoyTaskView,
  NotionDashboardData,
  NotionProject,
  NotionTask,
  NotionTaskDuration,
  NotionTaskPriority,
} from '@/types/notion';

export type {
  HoyNotionView,
  HoyProjectView,
  HoySuggestedAction,
  HoyTaskView,
} from '@/types/notion';

const PRIORITY_RANK: Record<NotionTaskPriority, number> = {
  Alta: 0,
  Media: 1,
  Baja: 2,
};

/** Umbral: compromiso cercano (minutos). */
const NEARBY_COMMITMENT_MINUTES = 15;

function priorityRank(priority: NotionTaskPriority | null): number {
  return priority ? PRIORITY_RANK[priority] : 9;
}

function toHoyTask(task: NotionTask): HoyTaskView {
  const projectUnavailable = task.project !== null && !task.project.available;
  const areaUnavailable = task.area !== null && !task.area.available;
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    duration: task.duration,
    energy: task.energy,
    date: task.date,
    areaName: task.area?.available ? (task.area.name ?? null) : null,
    projectName: task.project?.available ? (task.project.name ?? null) : null,
    blocker: task.blocker,
    relationUnavailable: projectUnavailable || areaUnavailable,
  };
}

function toHoyProject(project: NotionProject, today: string): HoyProjectView {
  const withoutNextAction = project.nextAction === null || project.nextAction.trim() === '';
  const blocked = Boolean(project.blocker && project.blocker.trim() !== '');
  const dueSoon =
    project.dueDate !== null && project.dueDate >= today && project.dueDate <= addDaysYmd(today, 7);
  return {
    id: project.id,
    name: project.name,
    areaName: project.area?.available ? project.area.name : null,
    expectedResult: project.expectedResult,
    nextAction: project.nextAction,
    dueDate: project.dueDate,
    reviewDate: project.reviewDate,
    relatedTaskCount: project.relatedTaskCount,
    blocker: project.blocker,
    withoutNextAction,
    blocked,
    dueSoon,
    relationUnavailable: project.area !== null && !project.area.available,
  };
}

/** Vencida operativa: fecha pasada, no hecha, no «Algún día». */
export function isHoyOverdueTask(task: NotionTask): boolean {
  if (task.status === 'Hecha' || task.status === 'Algún día') return false;
  return isTaskOverdue(task.dateKind, task.status);
}

export function sortOverdueTasks(tasks: readonly NotionTask[]): NotionTask[] {
  return [...tasks].sort((a, b) => {
    const dateA = a.date ?? '9999-99-99';
    const dateB = b.date ?? '9999-99-99';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return priorityRank(a.priority) - priorityRank(b.priority);
  });
}

export function sortActiveProjects(
  projects: readonly NotionProject[],
  today: string,
): NotionProject[] {
  return [...projects].sort((a, b) => {
    const va = toHoyProject(a, today);
    const vb = toHoyProject(b, today);
    if (va.blocked !== vb.blocked) return va.blocked ? -1 : 1;
    if (va.withoutNextAction !== vb.withoutNextAction) return va.withoutNextAction ? -1 : 1;
    if (va.dueSoon !== vb.dueSoon) return va.dueSoon ? -1 : 1;
    const dueA = a.dueDate ?? '9999-99-99';
    const dueB = b.dueDate ?? '9999-99-99';
    return dueA.localeCompare(dueB);
  });
}

/**
 * Duración máxima estimada de una etiqueta Notion (null = desconocida, no inventar).
 */
export function taskDurationMaxMinutes(duration: NotionTaskDuration | null): number | null {
  if (duration === '5-15 min') return 15;
  if (duration === '30 min') return 30;
  if (duration === '1 h') return 60;
  if (duration === '2 h+') return 120;
  return null;
}

/**
 * Minutos disponibles para sugerencias a partir del preview Calendar.
 * null = sin filtro por tiempo (Calendar no disponible o sin dato usable).
 */
export function availableMinutesForSuggestions(
  calendar: CalendarTodayPreview | null | undefined,
): number | null {
  if (!calendar || isCalendarHoyUnavailable(calendar.status)) return null;

  const { focus } = calendar;
  if (focus.status === 'in-event') {
    return focus.freeBlockDurationMinutes;
  }
  if (focus.status === 'between-events') {
    const until = focus.minutesUntilNext;
    const free = focus.freeBlockDurationMinutes;
    if (until === null && free === null) return null;
    if (until === null) return free;
    if (free === null) return until;
    return Math.min(until, free);
  }
  if (focus.status === 'free' || focus.status === 'empty-day') {
    return focus.remainingFreeMinutes ?? focus.freeBlockDurationMinutes;
  }
  return focus.freeBlockDurationMinutes;
}

function taskFitsAvailableBlock(task: NotionTask, availableMinutes: number | null): boolean {
  if (availableMinutes === null) return true;
  const max = taskDurationMaxMinutes(task.duration);
  if (max === null) return true;
  return max <= availableMinutes;
}

/**
 * Hasta tres próximas acciones por reglas fijas (sin IA).
 * Calendar solo evita sugerencias incompatibles con el bloque libre;
 * no oculta tareas importantes solo por existir Calendar.
 *
 * Orden: compromiso cercano → hoy Alta compatible → vencida Alta compatible →
 * En progreso → próxima acción de proyecto → pendiente Media compatible.
 */
export function suggestNextActions(
  data: NotionDashboardData,
  calendar?: CalendarTodayPreview | null,
  limit = 3,
): HoySuggestedAction[] {
  const completedProjectIds = new Set(
    data.projects
      .filter((p) => p.status === 'Completado' || p.status === 'Cancelado')
      .map((p) => p.id),
  );

  const usable = data.tasks.filter((task) => {
    if (task.status === 'Hecha') return false;
    if (task.project?.id && completedProjectIds.has(task.project.id)) return false;
    return true;
  });

  const availableMinutes = availableMinutesForSuggestions(calendar);
  const seen = new Set<string>();
  const out: HoySuggestedAction[] = [];

  const push = (action: HoySuggestedAction) => {
    if (seen.has(action.id) || out.length >= limit) return;
    seen.add(action.id);
    out.push(action);
  };

  if (calendar && !isCalendarHoyUnavailable(calendar.status)) {
    const { focus } = calendar;
    if (focus.currentEvent) {
      push({
        id: `event:${focus.currentEvent.id}`,
        title: focus.currentEvent.title,
        reason: 'Evento en curso',
        href: '/agenda?view=today',
      });
    } else if (
      focus.nextEvent &&
      focus.minutesUntilNext !== null &&
      focus.minutesUntilNext <= NEARBY_COMMITMENT_MINUTES
    ) {
      push({
        id: `event:${focus.nextEvent.id}`,
        title: focus.nextEvent.title,
        reason: 'Próximo compromiso cercano',
        href: '/agenda?view=today',
      });
    }
  }

  for (const task of usable) {
    if (
      task.dateKind === 'today' &&
      task.priority === 'Alta' &&
      taskFitsAvailableBlock(task, availableMinutes)
    ) {
      push({
        id: `task:${task.id}`,
        title: task.title,
        reason: 'Tarea de hoy · prioridad Alta',
        href: '/tareas',
      });
    }
  }

  for (const task of sortOverdueTasks(usable.filter(isHoyOverdueTask))) {
    if (task.priority === 'Alta' && taskFitsAvailableBlock(task, availableMinutes)) {
      push({
        id: `task:${task.id}`,
        title: task.title,
        reason: 'Tarea vencida · prioridad Alta',
        href: '/tareas',
      });
    }
  }

  for (const task of usable) {
    if (task.status === 'En progreso') {
      push({
        id: `task:${task.id}`,
        title: task.title,
        reason: 'En progreso',
        href: '/tareas',
      });
    }
  }

  for (const project of data.projects.filter((p) => p.status === 'Activo')) {
    if (project.nextAction && project.nextAction.trim() !== '') {
      push({
        id: `project:${project.id}`,
        title: project.nextAction,
        reason: `Próxima acción · ${project.name}`,
        href: '/proyectos',
      });
    }
  }

  for (const task of usable) {
    if (
      task.status === 'Pendiente' &&
      task.priority === 'Media' &&
      taskFitsAvailableBlock(task, availableMinutes)
    ) {
      push({
        id: `task:${task.id}`,
        title: task.title,
        reason: 'Pendiente · prioridad Media',
        href: '/tareas',
      });
    }
  }

  return out;
}

/** Construye la vista Hoy a partir del dashboard Notion (una sola carga). */
export function buildHoyNotionView(
  data: NotionDashboardData,
  calendar?: CalendarTodayPreview | null,
): HoyNotionView {
  const today = data.targetDate;
  const dueTodayTasks = data.tasks.filter(
    (task) => task.dateKind === 'today' && task.status !== 'Hecha',
  );
  const dueTodayIds = new Set(dueTodayTasks.map((t) => t.id));

  const overdueTasks = sortOverdueTasks(
    data.tasks.filter((task) => isHoyOverdueTask(task) && !dueTodayIds.has(task.id)),
  );
  const overdueIds = new Set(overdueTasks.map((t) => t.id));
  const claimed = new Set([...dueTodayIds, ...overdueIds]);

  const inProgressTasks = data.tasks.filter(
    (task) => task.status === 'En progreso' && !claimed.has(task.id),
  );
  const blockedTasks = data.tasks.filter(
    (task) => task.status === 'Bloqueada' && !claimed.has(task.id),
  );

  const activeProjects = sortActiveProjects(
    data.projects.filter((project) => project.status === 'Activo'),
    today,
  );

  const withoutNextAction = activeProjects.filter(
    (p) => p.nextAction === null || p.nextAction.trim() === '',
  ).length;

  return {
    status: data.status,
    source: data.source,
    notice: data.notice,
    dueToday: dueTodayTasks.map(toHoyTask),
    overdue: overdueTasks.map(toHoyTask),
    inProgress: inProgressTasks.map(toHoyTask),
    blocked: blockedTasks.map(toHoyTask),
    activeProjects: activeProjects.map((p) => toHoyProject(p, today)),
    summary: {
      dueToday: dueTodayTasks.length,
      overdue: overdueTasks.length,
      inProgress: data.tasks.filter((t) => t.status === 'En progreso').length,
      blocked: data.tasks.filter((t) => t.status === 'Bloqueada').length,
      activeProjects: activeProjects.length,
      withoutNextAction,
    },
    suggestedActions: suggestNextActions(data, calendar),
  };
}

export function emptyHoyNotionView(): HoyNotionView {
  return {
    status: 'mock',
    source: 'mock',
    notice: null,
    dueToday: [],
    overdue: [],
    inProgress: [],
    blocked: [],
    activeProjects: [],
    summary: {
      dueToday: 0,
      overdue: 0,
      inProgress: 0,
      blocked: 0,
      activeProjects: 0,
      withoutNextAction: 0,
    },
    suggestedActions: [],
  };
}
