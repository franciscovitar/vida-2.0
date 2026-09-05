import { addDaysYmd, todayInBuenosAires } from '@/lib/adapters/dates';
import { buildNameMap } from '@/lib/notion/adapters';
import {
  adaptDailyPlanningProjectBase,
  adaptDailyPlanningTask,
  assembleDailyPlanningProject,
} from '@/lib/notion/daily-planning-adapters';
import { adaptMilestone } from '@/lib/notion/projects-intelligence-adapters';
import type { NotionReadPort } from '@/lib/notion/client';
import type {
  ProjectsIntelligenceConfigResult,
  ProjectsIntelligenceNotionConfig,
} from '@/lib/notion/config';
import type { NotionReadCode } from '@/lib/notion/errors';
import type { NotionDataSourceMode } from '@/types/notion';
import type {
  CalendarConfigResult,
  CalendarOAuthConfig,
} from '@/lib/calendar/config-resolve';
import type { CalendarReadCode } from '@/lib/calendar/errors';
import type { CalendarDataSourceMode } from '@/types/calendar';
import type { LoadDailyPlanningCalendarEventsResult } from '@/lib/calendar/planning-queries';
import type {
  DailyPlanningCalendarEvent,
  DailyPlanningCalendarSourceStatus,
  DailyPlanningContext,
  DailyPlanningNotionSourceStatus,
  DailyPlanningProject,
  DailyPlanningSourceState,
  DailyPlanningTask,
} from '@/types/daily-planning-intelligence';
import type {
  ProjectsIntelligenceMilestone,
  ProjectsIntelligenceProjectBase,
} from '@/types/projects-intelligence';

export const DAILY_PLANNING_HORIZON_DAYS = 30;

interface DailyPlanningLoaderDeps {
  today?: () => string;
  now?: () => Date;
  getNotionDataSource?: () => NotionDataSourceMode;
  getNotionConfig?: () => ProjectsIntelligenceConfigResult;
  createNotionPort?: (token: string) => Promise<NotionReadPort> | NotionReadPort;
  getCalendarDataSource?: () => CalendarDataSourceMode;
  getCalendarConfig?: () => CalendarConfigResult;
  getCalendarTimezone?: () => string;
  loadCalendar?: (
    config: CalendarOAuthConfig,
    startYmd: string,
    endYmd: string,
  ) => Promise<LoadDailyPlanningCalendarEventsResult>;
}

function notionStatusFromCode(code: NotionReadCode): DailyPlanningNotionSourceStatus {
  return code === 'forbidden-data-source' ? 'missing-data-source' : code;
}

function notionNotice(status: DailyPlanningNotionSourceStatus, sourceName: string): string | null {
  if (status === 'ready') return null;
  if (status === 'empty') return `${sourceName}: sin registros.`;
  const messages: Record<Exclude<DailyPlanningNotionSourceStatus, 'ready' | 'empty'>, string> = {
    'not-configured': `${sourceName}: Notion no está configurado.`,
    'auth-error': `${sourceName}: no se pudo autenticar con Notion.`,
    'permission-error': `${sourceName}: sin permiso de lectura en Notion.`,
    'missing-data-source': `${sourceName}: falta o no está permitido el data source esperado.`,
    'missing-property': `${sourceName}: faltan propiedades canónicas esperadas.`,
    'rate-limited': `${sourceName}: Notion limitó temporalmente la lectura.`,
    'network-error': `${sourceName}: no se pudo conectar con Notion.`,
    'read-error': `${sourceName}: no se pudo completar la lectura.`,
  };
  return messages[status];
}

function notionState(
  status: DailyPlanningNotionSourceStatus,
  sourceName: string,
): DailyPlanningSourceState<DailyPlanningNotionSourceStatus> {
  return {
    status,
    available: status === 'ready' || status === 'empty',
    notice: notionNotice(status, sourceName),
  };
}

function calendarNotice(status: DailyPlanningCalendarSourceStatus): string | null {
  if (status === 'ready') return null;
  if (status === 'empty') return 'Calendar: sin eventos en el horizonte.';
  const messages: Record<Exclude<DailyPlanningCalendarSourceStatus, 'ready' | 'empty'>, string> = {
    'not-configured': 'Calendar: integración real no configurada.',
    'auth-error': 'Calendar: no se pudo autenticar.',
    'permission-error': 'Calendar: sin permiso de lectura.',
    'invalid-calendar-id': 'Calendar: hay un ID configurado inválido.',
    'calendar-not-found': 'Calendar: no se encontró un calendario autorizado.',
    'rate-limited': 'Calendar: Google limitó temporalmente la lectura.',
    'network-error': 'Calendar: no se pudo conectar con Google.',
    'read-error': 'Calendar: no se pudo completar la lectura.',
  };
  return messages[status];
}

function calendarState(status: DailyPlanningCalendarSourceStatus) {
  return {
    status,
    available: status === 'ready' || status === 'empty',
    notice: calendarNotice(status),
  };
}

function emptyNotionStates(status: DailyPlanningNotionSourceStatus) {
  return {
    tasks: notionState(status, 'Tareas'),
    projects: notionState(status, 'Proyectos'),
    milestones: notionState(status, 'Hitos'),
  };
}

async function loadNotionFacts(
  mode: NotionDataSourceMode,
  configResult: ProjectsIntelligenceConfigResult,
  createPort: (token: string) => Promise<NotionReadPort> | NotionReadPort,
  today: string,
): Promise<{
  states: ReturnType<typeof emptyNotionStates>;
  tasks: DailyPlanningTask[];
  projects: DailyPlanningProject[];
}> {
  if (mode !== 'notion') {
    return { states: emptyNotionStates('not-configured'), tasks: [], projects: [] };
  }
  if (!configResult.ok) {
    const status: DailyPlanningNotionSourceStatus =
      configResult.reason === 'forbidden-data-source' ? 'missing-data-source' : 'not-configured';
    return { states: emptyNotionStates(status), tasks: [], projects: [] };
  }

  let port: NotionReadPort;
  try {
    port = await createPort(configResult.config.token);
  } catch {
    return { states: emptyNotionStates('read-error'), tasks: [], projects: [] };
  }

  const config: ProjectsIntelligenceNotionConfig = configResult.config;
  const [tasksResult, projectsResult, milestonesResult] = await Promise.all([
    port.queryDataSource(config.tasksDataSourceId),
    port.queryDataSource(config.projectsDataSourceId),
    port.queryDataSource(config.milestonesDataSourceId),
  ]);

  let projectState = projectsResult.ok
    ? notionState(projectsResult.pages.length === 0 ? 'empty' : 'ready', 'Proyectos')
    : notionState(notionStatusFromCode(projectsResult.code), 'Proyectos');
  let projectBases: ProjectsIntelligenceProjectBase[] = [];
  if (projectsResult.ok) {
    for (const page of projectsResult.pages) {
      const adapted = adaptDailyPlanningProjectBase(page);
      if (!adapted.ok) {
        projectState = notionState('missing-property', 'Proyectos');
        projectBases = [];
        break;
      }
      projectBases.push(adapted.project);
    }
  }

  const projectNames = buildNameMap(projectBases.map((project) => ({
    id: project.id,
    name: project.name,
  })));

  let taskState = tasksResult.ok
    ? notionState(tasksResult.pages.length === 0 ? 'empty' : 'ready', 'Tareas')
    : notionState(notionStatusFromCode(tasksResult.code), 'Tareas');
  let allTasks: DailyPlanningTask[] = [];
  if (tasksResult.ok) {
    for (const page of tasksResult.pages) {
      const adapted = adaptDailyPlanningTask(page, projectNames, today);
      if (!adapted.ok) {
        taskState = notionState('missing-property', 'Tareas');
        allTasks = [];
        break;
      }
      allTasks.push(adapted.task);
    }
  }

  const taskNames = buildNameMap(allTasks.map((task) => ({ id: task.id, name: task.title })));

  const milestoneState = milestonesResult.ok
    ? notionState(milestonesResult.pages.length === 0 ? 'empty' : 'ready', 'Hitos')
    : notionState(notionStatusFromCode(milestonesResult.code), 'Hitos');
  const milestones: ProjectsIntelligenceMilestone[] = milestonesResult.ok
    ? milestonesResult.pages.map(adaptMilestone)
    : [];
  const milestonesByProject = new Map<string, ProjectsIntelligenceMilestone[]>();
  if (milestoneState.available) {
    for (const milestone of milestones) {
      if (!milestone.projectId) continue;
      const current = milestonesByProject.get(milestone.projectId) ?? [];
      current.push(milestone);
      milestonesByProject.set(milestone.projectId, current);
    }
  }

  const projects = projectState.available
    ? projectBases
        .filter((project) =>
          project.status === 'Activo' || project.status === 'En espera' || project.status === 'Bloqueado',
        )
        .map((project) =>
          assembleDailyPlanningProject(
            project,
            taskNames,
            milestoneState.available ? (milestonesByProject.get(project.id) ?? []) : null,
          ),
        )
    : [];

  const tasks = taskState.available
    ? allTasks.filter(
        (task) =>
          task.status === 'Pendiente' || task.status === 'En progreso' || task.status === 'Bloqueada',
      )
    : [];

  return {
    states: { tasks: taskState, projects: projectState, milestones: milestoneState },
    tasks,
    projects,
  };
}

async function loadCalendarFacts(
  mode: CalendarDataSourceMode,
  configResult: CalendarConfigResult,
  loadCalendar: (
    config: CalendarOAuthConfig,
    startYmd: string,
    endYmd: string,
  ) => Promise<LoadDailyPlanningCalendarEventsResult>,
  startYmd: string,
  endYmd: string,
): Promise<{
  state: ReturnType<typeof calendarState> & { mode: CalendarDataSourceMode };
  events: DailyPlanningCalendarEvent[];
  timezone: string | null;
}> {
  if (mode !== 'google') {
    return {
      state: { ...calendarState('not-configured'), mode },
      events: [],
      timezone: null,
    };
  }
  if (!configResult.ok) {
    const status: DailyPlanningCalendarSourceStatus = configResult.reason;
    return { state: { ...calendarState(status), mode }, events: [], timezone: null };
  }

  let result: LoadDailyPlanningCalendarEventsResult;
  try {
    result = await loadCalendar(configResult.config, startYmd, endYmd);
  } catch {
    result = { ok: false, code: 'read-error' };
  }
  if (!result.ok) {
    const status = result.code as CalendarReadCode as DailyPlanningCalendarSourceStatus;
    return {
      state: { ...calendarState(status), mode },
      events: [],
      timezone: configResult.config.timezone,
    };
  }

  const status: DailyPlanningCalendarSourceStatus = result.events.length === 0 ? 'empty' : 'ready';
  return {
    state: { ...calendarState(status), mode },
    events: result.events,
    timezone: configResult.config.timezone,
  };
}

function buildQuality(
  tasks: readonly DailyPlanningTask[],
  projects: readonly DailyPlanningProject[],
  events: readonly DailyPlanningCalendarEvent[],
  milestonesAvailable: boolean,
) {
  return {
    tasksWithAmbiguousDate: tasks.filter((task) => task.dateSemantics === 'relevant-date-unspecified').length,
    tasksMissingDuration: tasks.filter((task) => task.duration === null).length,
    tasksMissingPriority: tasks.filter((task) => task.priority === null).length,
    blockedTasksWithoutDetail: tasks.filter(
      (task) => task.status === 'Bloqueada' && !task.blocker?.trim(),
    ).length,
    unresolvedTaskRelations: tasks.filter((task) => task.relationUnavailable).length,
    projectsWithoutProgressSource: milestonesAvailable ? 0 : projects.length,
    calendarDateConflicts: events.filter((event) => event.evidence.dateConflict).length,
  };
}

function overallStatus(input: {
  tasksAvailable: boolean;
  projectsAvailable: boolean;
  milestonesAvailable: boolean;
  calendarAvailable: boolean;
  dataCount: number;
}): DailyPlanningContext['status'] {
  const allAvailable =
    input.tasksAvailable &&
    input.projectsAvailable &&
    input.milestonesAvailable &&
    input.calendarAvailable;
  if (allAvailable) return input.dataCount === 0 ? 'empty' : 'ready';

  const usefulSourceAvailable =
    input.tasksAvailable || input.projectsAvailable || input.calendarAvailable;
  return usefulSourceAvailable ? 'degraded' : 'unavailable';
}

export async function loadDailyPlanningContextUncached(
  deps: DailyPlanningLoaderDeps = {},
): Promise<DailyPlanningContext> {
  const today = deps.today ? deps.today() : todayInBuenosAires();
  const horizonEnd = addDaysYmd(today, DAILY_PLANNING_HORIZON_DAYS);
  const syncedAt = (deps.now ? deps.now() : new Date()).toISOString();

  const notionModule =
    deps.getNotionDataSource && deps.getNotionConfig ? null : await import('@/lib/notion/config');
  const getNotionDataSource = deps.getNotionDataSource ?? notionModule!.getNotionDataSource;
  const getNotionConfig = deps.getNotionConfig ?? notionModule!.getProjectsIntelligenceNotionConfig;
  const createNotionPort =
    deps.createNotionPort ??
    (async (token: string) => {
      const { createNotionReadPort } = await import('@/lib/notion/client');
      const { isAllowedProjectsIntelligenceDataSourceId } = await import('@/lib/notion/config');
      return createNotionReadPort(token, (id) => isAllowedProjectsIntelligenceDataSourceId(id));
    });

  const calendarModule =
    deps.getCalendarDataSource && deps.getCalendarConfig && deps.getCalendarTimezone
      ? null
      : await import('@/lib/calendar/config');
  const getCalendarDataSource = deps.getCalendarDataSource ?? calendarModule!.getCalendarDataSource;
  const getCalendarConfig = deps.getCalendarConfig ?? calendarModule!.getCalendarConfig;
  const getCalendarTimezone = deps.getCalendarTimezone ?? calendarModule!.getCalendarTimezone;
  const loadCalendar =
    deps.loadCalendar ??
    (async (config: CalendarOAuthConfig, startYmd: string, endYmd: string) => {
      const { loadDailyPlanningCalendarEventsInRange } = await import(
        '@/lib/calendar/planning-queries'
      );
      return loadDailyPlanningCalendarEventsInRange(config, startYmd, endYmd);
    });

  const notionMode = getNotionDataSource();
  const notionConfig = getNotionConfig();
  const calendarMode = getCalendarDataSource();
  const calendarConfig = getCalendarConfig();

  const [notion, calendar] = await Promise.all([
    loadNotionFacts(notionMode, notionConfig, createNotionPort, today),
    loadCalendarFacts(calendarMode, calendarConfig, loadCalendar, today, horizonEnd),
  ]);

  const timezone = calendar.timezone ?? getCalendarTimezone();
  const quality = buildQuality(
    notion.tasks,
    notion.projects,
    calendar.events,
    notion.states.milestones.available,
  );
  const status = overallStatus({
    tasksAvailable: notion.states.tasks.available,
    projectsAvailable: notion.states.projects.available,
    milestonesAvailable: notion.states.milestones.available,
    calendarAvailable: calendar.state.available,
    dataCount: notion.tasks.length + notion.projects.length + calendar.events.length,
  });

  return {
    status,
    targetDate: today,
    horizonEnd,
    syncedAt,
    timezone,
    sources: {
      ...notion.states,
      calendar: calendar.state,
    },
    tasks: notion.tasks,
    projects: notion.projects,
    calendarEvents: calendar.events,
    quality,
  };
}
