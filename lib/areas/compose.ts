/**
 * Composición pura del panel de Área (testeable, sin I/O).
 */
import {
  calendarKeywordsForSlug,
  getCanonicalAreaDef,
  resolveCanonicalSlugFromArea,
  type CanonicalAreaDef,
} from '@/lib/areas/canonical';
import { buildAreaIntegrityWarnings } from '@/lib/areas/integrity';
import { isExcludedProject, isExcludedTask, sanitizePublicNote } from '@/lib/areas/privacy';
import type {
  AreaCalendarSummary,
  AreaDashboardData,
  AreaDataSourceStatus,
  AreaMetricSummary,
  AreaProjectSummary,
  AreaSlug,
  AreaSummary,
  AreaTaskSummary,
  AreaVariantSection,
} from '@/types/areas';
import type { CalendarEvent } from '@/types/calendar';
import type { NotionArea, NotionDashboardData, NotionProject, NotionTask } from '@/types/notion';

function opaqueKey(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

function belongsToArea(
  relationId: string | null | undefined,
  relationName: string | null | undefined,
  area: NotionArea,
  def: CanonicalAreaDef,
): boolean {
  if (relationId && relationId === area.id) return true;
  if (relationName) {
    const n = relationName.trim().toLowerCase();
    if (def.matchNames.some((name) => name.toLowerCase() === n)) return true;
    if (def.keywords.some((keyword) => n.includes(keyword))) return true;
  }
  return false;
}

export function projectsForArea(
  projects: readonly NotionProject[],
  area: NotionArea,
  def: CanonicalAreaDef,
): NotionProject[] {
  return projects.filter(
    (project) =>
      belongsToArea(project.area?.id, project.area?.name, area, def) &&
      !isExcludedProject(project, def.slug),
  );
}

export function tasksForArea(
  tasks: readonly NotionTask[],
  area: NotionArea,
  def: CanonicalAreaDef,
  areaProjects: readonly NotionProject[],
): NotionTask[] {
  const projectIds = new Set(areaProjects.map((project) => project.id));
  return tasks.filter((task) => {
    if (isExcludedTask(task, def.slug)) return false;
    if (belongsToArea(task.area?.id, task.area?.name, area, def)) return true;
    if (belongsToArea(task.projectArea?.id, task.projectArea?.name, area, def)) return true;
    if (task.project?.id && projectIds.has(task.project.id)) return true;
    return false;
  });
}

function toProjectSummary(project: NotionProject, slug: AreaSlug): AreaProjectSummary {
  return {
    key: opaqueKey('proj', project.id),
    name: project.name,
    status: project.status,
    expectedResult: project.expectedResult,
    nextAction: project.nextAction,
    blocker: sanitizePublicNote(project.blocker, slug),
    dueDate: project.dueDate,
    href: '/proyectos',
  };
}

function toTaskSummary(task: NotionTask, slug: AreaSlug): AreaTaskSummary {
  return {
    key: opaqueKey('task', task.id),
    title: task.title,
    status: task.status,
    date: task.date,
    dateKind: task.dateKind,
    duration: task.duration,
    energy: task.energy,
    projectName: task.project?.available ? (task.project.name ?? null) : null,
    blocker: sanitizePublicNote(task.blocker, slug),
    href: '/tareas',
  };
}

function filterCalendar(events: readonly CalendarEvent[], slug: AreaSlug): AreaCalendarSummary[] {
  const keywords = calendarKeywordsForSlug(slug);
  return events
    .filter((event) => {
      const hay = `${event.title} ${event.location ?? ''}`.toLowerCase();
      return keywords.some((keyword) => hay.includes(keyword));
    })
    .slice(0, 8)
    .map((event) => ({
      key: opaqueKey('cal', event.id),
      title: event.title,
      startLabel: event.allDay
        ? event.startDate
        : `${event.startDate} ${event.startTime ?? ''}`.trim(),
      endLabel: event.allDay ? event.endDate : event.endTime,
      allDay: event.allDay,
      href: '/agenda' as const,
    }));
}

export type AreaSheetsSlice = {
  studyHoursWeek: string | null;
  studyTrend: string | null;
  workHoursWeek: string | null;
  sleepHours: string | null;
  energy: string | null;
  mood: string | null;
  exercise: string | null;
  coverage: string | null;
};

export type ComposeAreaInput = {
  slug: AreaSlug;
  notion: NotionDashboardData;
  calendarEvents: readonly CalendarEvent[];
  sheets: AreaSheetsSlice | null;
  sources: readonly AreaDataSourceStatus[];
  northHint: string | null;
  allowMockMetrics: boolean;
};

export function findCanonicalNotionArea(
  areas: readonly NotionArea[],
  slug: AreaSlug,
): NotionArea | null {
  const def = getCanonicalAreaDef(slug);
  if (!def) return null;
  for (const area of areas) {
    if (resolveCanonicalSlugFromArea(area) === slug) return area;
  }
  return null;
}

function buildVariant(
  slug: AreaSlug,
  sheets: AreaSheetsSlice | null,
  academicSections: readonly string[],
): AreaVariantSection {
  if (slug === 'facultad') {
    return {
      kind: 'facultad',
      studyHoursWeek: sheets?.studyHoursWeek ?? null,
      studyTrend: sheets?.studyTrend ?? null,
      academicSections,
    };
  }
  if (slug === 'genova-trabajo') {
    return { kind: 'trabajo', workHoursWeek: sheets?.workHoursWeek ?? null };
  }
  if (slug === 'salud') {
    return {
      kind: 'salud',
      sleepHours: sheets?.sleepHours ?? null,
      energy: sheets?.energy ?? null,
      mood: sheets?.mood ?? null,
      exercise: sheets?.exercise ?? null,
      coverage: sheets?.coverage ?? null,
    };
  }
  return {
    kind: 'personal',
    openPurchasesHint: null,
  };
}

function buildMetrics(slug: AreaSlug, sheets: AreaSheetsSlice | null): AreaMetricSummary[] {
  if (!sheets) return [];
  const metrics: AreaMetricSummary[] = [];
  if (slug === 'facultad' && sheets.studyHoursWeek) {
    metrics.push({
      key: 'study-hours',
      label: 'Estudio (semana)',
      value: sheets.studyHoursWeek,
      unit: 'h',
      context: sheets.studyTrend,
      kind: 'confirmed',
    });
  }
  if (slug === 'genova-trabajo' && sheets.workHoursWeek) {
    metrics.push({
      key: 'work-hours',
      label: 'Trabajo (semana)',
      value: sheets.workHoursWeek,
      unit: 'h',
      context: null,
      kind: 'confirmed',
    });
  }
  if (slug === 'salud') {
    if (sheets.sleepHours) {
      metrics.push({
        key: 'sleep',
        label: 'Sueño',
        value: sheets.sleepHours,
        unit: 'h',
        context: null,
        kind: 'confirmed',
      });
    }
    if (sheets.energy) {
      metrics.push({
        key: 'energy',
        label: 'Energía',
        value: sheets.energy,
        unit: null,
        context: null,
        kind: 'confirmed',
      });
    }
    if (sheets.mood) {
      metrics.push({
        key: 'mood',
        label: 'Ánimo',
        value: sheets.mood,
        unit: null,
        context: null,
        kind: 'confirmed',
      });
    }
    if (sheets.exercise) {
      metrics.push({
        key: 'exercise',
        label: 'Ejercicio',
        value: sheets.exercise,
        unit: null,
        context: null,
        kind: 'confirmed',
      });
    }
    if (sheets.coverage) {
      metrics.push({
        key: 'coverage',
        label: 'Cobertura de datos',
        value: sheets.coverage,
        unit: null,
        context: 'Solo cobertura de registro.',
        kind: 'coverage',
      });
    }
  }
  return metrics;
}

export function composeAreaSummary(
  area: NotionArea,
  def: CanonicalAreaDef,
  projects: readonly NotionProject[],
  tasks: readonly NotionTask[],
): AreaSummary {
  const activeProjects = projects.filter((project) => project.status === 'Activo');
  const pendingTasks = tasks.filter(
    (task) => task.status === 'Pendiente' || task.status === 'En progreso',
  );
  const primaryFocus =
    activeProjects.find((project) => project.nextAction)?.nextAction ??
    pendingTasks[0]?.title ??
    area.purpose;

  return {
    slug: def.slug,
    stableKey: def.stableKey,
    name: area.name,
    purpose: area.purpose,
    status: area.status,
    reviewDate: area.reviewDate,
    domain: def.domain,
    activeProjectCount: activeProjects.length,
    pendingTaskCount: pendingTasks.length,
    primaryFocus,
    href: `/areas/${def.slug}`,
  };
}

export function composeAreaDashboard(input: ComposeAreaInput): AreaDashboardData | null {
  const def = getCanonicalAreaDef(input.slug);
  if (!def) return null;
  const area = findCanonicalNotionArea(input.notion.areas, input.slug);
  if (!area) return null;

  const projects = projectsForArea(input.notion.projects, area, def);
  const tasks = tasksForArea(input.notion.tasks, area, def, projects);
  const sheets = input.allowMockMetrics || input.sheets ? input.sheets : null;

  const activeProjects = projects
    .filter((project) => project.status === 'Activo')
    .map((project) => toProjectSummary(project, def.slug));
  const blockedProjects = projects
    .filter((project) => project.status === 'Bloqueado')
    .map((project) => toProjectSummary(project, def.slug));

  const pendingTasks = tasks
    .filter((task) => task.status === 'Pendiente')
    .map((task) => toTaskSummary(task, def.slug));
  const inProgressTasks = tasks
    .filter((task) => task.status === 'En progreso')
    .map((task) => toTaskSummary(task, def.slug));
  const blockedTasks = tasks
    .filter((task) => task.status === 'Bloqueada')
    .map((task) => toTaskSummary(task, def.slug));
  const overdueTasks = tasks
    .filter((task) => task.dateKind === 'overdue' && task.status !== 'Hecha')
    .map((task) => toTaskSummary(task, def.slug));
  const upcomingTasks = tasks
    .filter(
      (task) =>
        (task.dateKind === 'today' || task.dateKind === 'future') && task.status !== 'Hecha',
    )
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .slice(0, 12)
    .map((task) => toTaskSummary(task, def.slug));

  const nextAction =
    activeProjects.find((project) => project.nextAction)?.nextAction ??
    inProgressTasks[0]?.title ??
    pendingTasks[0]?.title ??
    null;

  const academicSections = [
    ...new Set(
      projects
        .map((project) => project.name)
        .filter((name) => /materia|curso|tp|examen|cursada/i.test(name)),
    ),
  ].slice(0, 8);

  return {
    summary: composeAreaSummary(area, def, projects, tasks),
    northHint: input.northHint,
    localContract: area.purpose,
    activeProjects,
    blockedProjects,
    pendingTasks,
    inProgressTasks,
    blockedTasks,
    upcomingTasks,
    overdueTasks,
    nextAction,
    calendar: filterCalendar(input.calendarEvents, def.slug),
    metrics: buildMetrics(def.slug, sheets),
    sources: input.sources,
    integrity: buildAreaIntegrityWarnings({
      area,
      projects,
      tasks,
      areaNotionId: area.id,
    }),
    variant: buildVariant(def.slug, sheets, academicSections),
    targetDate: input.notion.targetDate,
  };
}

export function composeAreasIndex(
  notion: NotionDashboardData,
  sources: readonly AreaDataSourceStatus[],
): { summaries: AreaSummary[]; sources: readonly AreaDataSourceStatus[] } {
  const summaries: AreaSummary[] = [];
  for (const def of [
    getCanonicalAreaDef('facultad')!,
    getCanonicalAreaDef('genova-trabajo')!,
    getCanonicalAreaDef('salud')!,
    getCanonicalAreaDef('vida-personal')!,
  ]) {
    const area = findCanonicalNotionArea(notion.areas, def.slug);
    if (!area) continue;
    const projects = projectsForArea(notion.projects, area, def);
    const tasks = tasksForArea(notion.tasks, area, def, projects);
    summaries.push(composeAreaSummary(area, def, projects, tasks));
  }
  return { summaries, sources };
}
