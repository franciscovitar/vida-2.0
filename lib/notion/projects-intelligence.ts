/**
 * Carga Projects Intelligence (lectura, V1): Proyectos + Hitos + Tareas.
 *
 * Camino dedicado y paralelo al dashboard genérico (`lib/notion/dashboard.ts`).
 * No lo modifica ni lo reutiliza: Hoy, Tareas, Áreas y el `/proyectos`
 * genérico actual siguen exactamente igual.
 *
 * Regla crítica: en modo Notion real, cualquier fallo de configuración,
 * autenticación, permisos, data source, lectura o excepción inesperada
 * devuelve una respuesta explícitamente vacía y marcada con el código de
 * fallo real. Nunca se sustituye por proyectos personales simulados. El modo
 * mock (`NOTION_DATA_SOURCE !== 'notion'`) también devuelve una lista vacía en
 * este pase: no se implementan fixtures de demo con apariencia de datos
 * personales.
 */
import { cache } from 'react';

import { adaptTask, buildNameMap } from '@/lib/notion/adapters';
import { addDaysYmd, todayInBuenosAires } from '@/lib/adapters/dates';
import type { NotionReadPort } from '@/lib/notion/client';
import { classifyDateKind } from '@/lib/notion/classify';
import {
  getNotionDataSource,
  getProjectsIntelligenceNotionConfig,
  isAllowedProjectsIntelligenceDataSourceId,
  type ProjectsIntelligenceConfigResult,
  type ProjectsIntelligenceNotionConfig,
} from '@/lib/notion/config';
import type { NotionReadCode } from '@/lib/notion/errors';
import {
  adaptMilestone,
  adaptProjectIntelligenceBase,
} from '@/lib/notion/projects-intelligence-adapters';
import { computeProjectProgress } from '@/lib/notion/projects-intelligence-progress';
import type { NotionDataSourceMode, NotionTask } from '@/types/notion';
import type {
  ProjectIntelligenceSourceStatus,
  ProjectProgress,
  ProjectsIntelligenceData,
  ProjectsIntelligenceMilestone,
  ProjectsIntelligenceProject,
  ProjectsIntelligenceProjectQuality,
  ProjectsIntelligenceQualitySummary,
  ProjectsIntelligenceSourceMode,
  ProjectsIntelligenceSummary,
} from '@/types/projects-intelligence';

/**
 * Heurística de frescura de datos para el snapshot PI, NO verdad canónica.
 * Umbral conservador y documentado; puede ajustarse en un pase posterior sin
 * afectar el contrato del progreso ni de la lectura.
 */
export const PI_SNAPSHOT_STALE_AFTER_DAYS = 14;

function emptySummary(total = 0): ProjectsIntelligenceSummary {
  return {
    total,
    active: 0,
    waiting: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    progressMeasurable: 0,
    progressUnmeasurable: 0,
    withoutNextAction: 0,
    withoutDefinitionOfDone: 0,
  };
}

function emptyQualitySummary(): ProjectsIntelligenceQualitySummary {
  return {
    missingDefinitionOfDone: 0,
    missingNextAction: 0,
    blocked: 0,
    staleReview: 0,
    stalePiSnapshot: 0,
    invalidMilestones: 0,
  };
}

function buildProjectQuality(
  project: {
    status: string;
    definitionOfDone: string | null;
    nextAction: string | null;
    blocker: string | null;
    reviewDate: string | null;
    piReviewedAt: string | null;
  },
  progress: ProjectProgress,
  today: string,
): ProjectsIntelligenceProjectQuality {
  const staleReview =
    project.reviewDate !== null && classifyDateKind(project.reviewDate, today) === 'overdue';
  const staleCutoff = addDaysYmd(today, -PI_SNAPSHOT_STALE_AFTER_DAYS);
  const stalePiSnapshot = project.piReviewedAt !== null && project.piReviewedAt < staleCutoff;
  const invalidMilestones =
    !progress.measurable &&
    (progress.reason === 'invalid-weight' || progress.reason === 'invalid-total');

  return {
    missingDefinitionOfDone:
      project.definitionOfDone === null || project.definitionOfDone.trim() === '',
    missingNextAction: project.nextAction === null || project.nextAction.trim() === '',
    blocked:
      project.status === 'Bloqueado' || (project.blocker !== null && project.blocker.trim() !== ''),
    staleReview,
    stalePiSnapshot,
    invalidMilestones,
    progressMeasurable: progress.measurable,
  };
}

function summarizeProjects(
  projects: readonly ProjectsIntelligenceProject[],
): ProjectsIntelligenceSummary {
  const summary = emptySummary(projects.length);
  for (const project of projects) {
    if (project.status === 'Activo') summary.active += 1;
    if (project.status === 'En espera') summary.waiting += 1;
    if (project.status === 'Bloqueado') summary.blocked += 1;
    if (project.status === 'Completado') summary.completed += 1;
    if (project.status === 'Cancelado') summary.cancelled += 1;
    if (project.progress.measurable) {
      summary.progressMeasurable += 1;
    } else {
      summary.progressUnmeasurable += 1;
    }
    if (project.quality.missingNextAction) summary.withoutNextAction += 1;
    if (project.quality.missingDefinitionOfDone) summary.withoutDefinitionOfDone += 1;
  }
  return summary;
}

function summarizeQuality(
  projects: readonly ProjectsIntelligenceProject[],
): ProjectsIntelligenceQualitySummary {
  const summary = emptyQualitySummary();
  for (const project of projects) {
    if (project.quality.missingDefinitionOfDone) summary.missingDefinitionOfDone += 1;
    if (project.quality.missingNextAction) summary.missingNextAction += 1;
    if (project.quality.blocked) summary.blocked += 1;
    if (project.quality.staleReview) summary.staleReview += 1;
    if (project.quality.stalePiSnapshot) summary.stalePiSnapshot += 1;
    if (project.quality.invalidMilestones) summary.invalidMilestones += 1;
  }
  return summary;
}

/**
 * Ensambla el DTO Projects Intelligence a partir de un puerto de lectura ya
 * autorizado. Si cualquiera de las tres fuentes requeridas falla, la carga
 * completa falla cerrada (no se devuelven Proyectos sin sus Hitos/Tareas).
 */
export async function loadProjectsIntelligenceFromPort(
  port: NotionReadPort,
  config: ProjectsIntelligenceNotionConfig,
  today: string,
  syncedAt: string,
): Promise<{ ok: true; data: ProjectsIntelligenceData } | { ok: false; code: NotionReadCode }> {
  const [projectsResult, milestonesResult, tasksResult] = await Promise.all([
    port.queryDataSource(config.projectsDataSourceId),
    port.queryDataSource(config.milestonesDataSourceId),
    port.queryDataSource(config.tasksDataSourceId),
  ]);

  if (!projectsResult.ok) return { ok: false, code: projectsResult.code };
  if (!milestonesResult.ok) return { ok: false, code: milestonesResult.code };
  if (!tasksResult.ok) return { ok: false, code: tasksResult.code };

  const projectBases = projectsResult.pages.map((page) => adaptProjectIntelligenceBase(page));
  const projectNames = buildNameMap(
    projectBases.map((project) => ({ id: project.id, name: project.name })),
  );
  const milestones = milestonesResult.pages.map((page) => adaptMilestone(page));
  // Sin consulta a Áreas: los nombres de área de las tareas quedan sin resolver.
  const tasks = tasksResult.pages.map((page) => adaptTask(page, projectNames, new Map(), today));

  const milestonesByProject = new Map<string, ProjectsIntelligenceMilestone[]>();
  for (const milestone of milestones) {
    if (!milestone.projectId) continue;
    const list = milestonesByProject.get(milestone.projectId) ?? [];
    list.push(milestone);
    milestonesByProject.set(milestone.projectId, list);
  }

  const tasksByProject = new Map<string, NotionTask[]>();
  for (const task of tasks) {
    if (!task.project?.id) continue;
    const list = tasksByProject.get(task.project.id) ?? [];
    list.push(task);
    tasksByProject.set(task.project.id, list);
  }

  const projects: ProjectsIntelligenceProject[] = projectBases.map((base) => {
    const projectMilestones = milestonesByProject.get(base.id) ?? [];
    const relatedTasks = tasksByProject.get(base.id) ?? [];
    const progress = computeProjectProgress(projectMilestones);
    const openTaskCount = relatedTasks.filter(
      (task) => task.status === 'Pendiente' || task.status === 'En progreso',
    ).length;
    const blockedTaskCount = relatedTasks.filter((task) => task.status === 'Bloqueada').length;
    const quality = buildProjectQuality(base, progress, today);

    return {
      ...base,
      relatedTaskCount: relatedTasks.length,
      openTaskCount,
      blockedTaskCount,
      relatedTasks,
      milestones: projectMilestones,
      progress,
      quality,
    };
  });

  return {
    ok: true,
    data: {
      source: 'notion',
      status: projects.length === 0 ? 'empty' : 'ready',
      notice: null,
      syncedAt,
      targetDate: today,
      projects,
      summary: summarizeProjects(projects),
      quality: summarizeQuality(projects),
    },
  };
}

function piNoticeFor(status: Exclude<ProjectIntelligenceSourceStatus, 'ready'>): string {
  const messages: Record<typeof status, string> = {
    'not-configured': 'Projects Intelligence no está configurado. Sin datos disponibles.',
    'auth-error': 'No se pudo autenticar con Notion. Sin datos disponibles.',
    'permission-error': 'Sin permiso de lectura en Notion. Sin datos disponibles.',
    'missing-data-source':
      'Falta un data source esperado (Proyectos, Tareas o Hitos de proyecto). Sin datos disponibles.',
    'missing-property': 'Faltan propiedades esperadas en Notion. Sin datos disponibles.',
    'rate-limited': 'Notion limitó la lectura. Sin datos disponibles.',
    'network-error': 'No se pudo conectar con Notion. Sin datos disponibles.',
    'read-error': 'No se pudieron leer los datos de Notion. Sin datos disponibles.',
    empty: 'No hay proyectos en las bases canónicas para este momento.',
  };
  return messages[status];
}

const MOCK_MODE_NOTICE =
  'Projects Intelligence en modo mock: la fuente Notion no está activa. No se muestran datos personales simulados en este pase.';

function unavailableData(
  today: string,
  syncedAt: string,
  source: ProjectsIntelligenceSourceMode,
  status: ProjectIntelligenceSourceStatus,
  notice: string | null,
): ProjectsIntelligenceData {
  return {
    source,
    status,
    notice,
    syncedAt,
    targetDate: today,
    projects: [],
    summary: emptySummary(),
    quality: emptyQualitySummary(),
  };
}

async function defaultCreatePort(token: string): Promise<NotionReadPort> {
  const { createNotionReadPort } = await import('@/lib/notion/client');
  return createNotionReadPort(token, (id) => isAllowedProjectsIntelligenceDataSourceId(id));
}

/** Dependencias inyectables para pruebas (fail-closed determinístico, sin red). */
export interface ProjectsIntelligenceLoaderDeps {
  today?: () => string;
  now?: () => Date;
  getDataSource?: () => NotionDataSourceMode;
  getConfig?: () => ProjectsIntelligenceConfigResult;
  createPort?: (token: string) => Promise<NotionReadPort> | NotionReadPort;
}

export async function loadProjectsIntelligenceUncached(
  deps: ProjectsIntelligenceLoaderDeps = {},
): Promise<ProjectsIntelligenceData> {
  const today = deps.today ? deps.today() : todayInBuenosAires();
  const syncedAt = (deps.now ? deps.now() : new Date()).toISOString();
  const getDataSource = deps.getDataSource ?? getNotionDataSource;
  const getConfig = deps.getConfig ?? getProjectsIntelligenceNotionConfig;
  const createPort = deps.createPort ?? defaultCreatePort;

  if (getDataSource() !== 'notion') {
    return unavailableData(today, syncedAt, 'mock', 'not-configured', MOCK_MODE_NOTICE);
  }

  const configResult = getConfig();
  if (!configResult.ok) {
    const status: ProjectIntelligenceSourceStatus =
      configResult.reason === 'forbidden-data-source' ? 'missing-data-source' : 'not-configured';
    return unavailableData(today, syncedAt, 'notion', status, piNoticeFor(status));
  }

  try {
    const port = await createPort(configResult.config.token);
    const result = await loadProjectsIntelligenceFromPort(
      port,
      configResult.config,
      today,
      syncedAt,
    );
    if (!result.ok) {
      const status: ProjectIntelligenceSourceStatus =
        result.code === 'forbidden-data-source' ? 'missing-data-source' : result.code;
      return unavailableData(today, syncedAt, 'notion', status, piNoticeFor(status));
    }
    if (result.data.status === 'empty') {
      return { ...result.data, notice: piNoticeFor('empty') };
    }
    return result.data;
  } catch {
    return unavailableData(today, syncedAt, 'notion', 'read-error', piNoticeFor('read-error'));
  }
}

/** Una carga por request, cacheada. Sin dependencias inyectadas (uso real). */
export const loadProjectsIntelligence = cache(() => loadProjectsIntelligenceUncached());
