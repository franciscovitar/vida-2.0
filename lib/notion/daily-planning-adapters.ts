import { adaptTask, resolveRelation, type NotionRawPage } from '@/lib/notion/adapters';
import { TASK_PROPS, TASK_STATUSES } from '@/lib/notion/constants';
import { inList, selectName, titlePlain } from '@/lib/notion/property-parsers';
import type { NotionRelation, NotionTask, NotionTaskStatus } from '@/types/notion';
import type {
  DailyPlanningProject,
  DailyPlanningTask,
} from '@/types/daily-planning-intelligence';
import type {
  ProjectProgress,
  ProjectsIntelligenceMilestone,
} from '@/types/projects-intelligence';
import {
  adaptProjectIntelligenceBase,
  type ProjectsIntelligenceProjectBase,
} from '@/lib/notion/projects-intelligence-adapters';
import { computeProjectProgress } from '@/lib/notion/projects-intelligence-progress';

export type DailyPlanningTaskAdaptResult =
  | { ok: true; task: DailyPlanningTask }
  | { ok: false; code: 'missing-property' };

export type DailyPlanningProjectBaseAdaptResult =
  | { ok: true; project: ProjectsIntelligenceProjectBase }
  | { ok: false; code: 'missing-property' };

/**
 * Adaptador estricto para Daily Planning.
 * A diferencia del dashboard Notion histórico, un Estado faltante/desconocido
 * no se convierte en Pendiente: esa fuente falla cerrada.
 */
export function adaptDailyPlanningTask(
  page: NotionRawPage,
  projectNames: ReadonlyMap<string, string>,
  today: string,
): DailyPlanningTaskAdaptResult {
  const title = titlePlain(page.properties[TASK_PROPS.title]).trim();
  const status = inList(
    selectName(page.properties[TASK_PROPS.status]),
    TASK_STATUSES,
  ) as NotionTaskStatus | null;

  if (!title || status === null) return { ok: false, code: 'missing-property' };

  const base: NotionTask = adaptTask(page, projectNames, new Map(), today);
  const projectRelationUnavailable = base.project !== null && !base.project.available;

  return {
    ok: true,
    task: {
      ...base,
      title,
      status,
      dateSemantics: base.date === null ? 'none' : 'relevant-date-unspecified',
      relationUnavailable: projectRelationUnavailable,
    },
  };
}

/** Estado de Proyecto también es estricto: nunca se fabrica Activo. */
export function adaptDailyPlanningProjectBase(
  page: NotionRawPage,
): DailyPlanningProjectBaseAdaptResult {
  const project = adaptProjectIntelligenceBase(page);
  if (!project.name.trim() || project.status === null) {
    return { ok: false, code: 'missing-property' };
  }
  return { ok: true, project };
}

export function assembleDailyPlanningProject(
  base: ProjectsIntelligenceProjectBase,
  taskNames: ReadonlyMap<string, string>,
  milestones: readonly ProjectsIntelligenceMilestone[] | null,
): DailyPlanningProject {
  const status = base.status;
  if (status === null) {
    // El caller valida esto antes; guard defensivo para mantener el contrato.
    throw new Error('Daily Planning project status must be validated before assembly');
  }

  const nextAction: NotionRelation | null = resolveRelation(base.nextActionTaskIds, taskNames);
  const progress: ProjectProgress | null =
    milestones === null ? null : computeProjectProgress(milestones);

  return {
    id: base.id,
    name: base.name,
    status,
    type: base.type,
    nextAction,
    lastAdvance: base.lastAdvance,
    blocker: base.blocker,
    dueDate: base.dueDate,
    reviewDate: base.reviewDate,
    progress,
    milestoneCount: milestones === null ? null : milestones.length,
  };
}
