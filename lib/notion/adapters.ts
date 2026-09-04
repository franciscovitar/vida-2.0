/**
 * Extracción y adaptación de propiedades Notion → DTO planos.
 */
import {
  AREA_PROPS,
  AREA_STATUSES,
  PROJECT_PROPS,
  PROJECT_STATUSES,
  TASK_DURATIONS,
  TASK_ENERGIES,
  TASK_PRIORITIES,
  TASK_PROPS,
  TASK_STATUSES,
} from '@/lib/notion/constants';
import { projectDateKind, taskDateKind } from '@/lib/notion/classify';
import {
  dateStart,
  inList,
  relationIds,
  richTextPlain,
  selectName,
  titlePlain,
} from '@/lib/notion/property-parsers';
import type { Domain } from '@/types';
import type {
  NotionArea,
  NotionAreaStatus,
  NotionProject,
  NotionProjectStatus,
  NotionRelation,
  NotionTask,
  NotionTaskDuration,
  NotionTaskEnergy,
  NotionTaskPriority,
  NotionTaskStatus,
} from '@/types/notion';

/** Página cruda mínima (sin depender del SDK). */
export type NotionRawPage = {
  id: string;
  properties: Record<string, unknown>;
};

export function areaDomain(name: string): Domain {
  const n = name.toLowerCase();
  if (n.includes('facultad')) return 'learning';
  if (n.includes('genova') || n.includes('trabajo')) return 'productivity';
  if (n.includes('salud')) return 'health';
  if (n.includes('personal') || n.includes('vida')) return 'neutral';
  return 'projects';
}

export function resolveRelation(
  ids: readonly string[],
  namesById: ReadonlyMap<string, string>,
): NotionRelation | null {
  if (ids.length === 0) return null;
  const id = ids[0];
  const name = namesById.get(id) ?? null;
  return {
    id,
    name,
    available: name !== null,
  };
}

export function adaptArea(page: NotionRawPage): NotionArea {
  const props = page.properties;
  const name = titlePlain(props[AREA_PROPS.title]);
  const status =
    inList(selectName(props[AREA_PROPS.status]), AREA_STATUSES) ?? ('Activa' as NotionAreaStatus);
  return {
    id: page.id,
    name,
    status,
    purpose: richTextPlain(props[AREA_PROPS.purpose]),
    reviewDate: dateStart(props[AREA_PROPS.reviewDate]),
    relatedProjectCount: relationIds(props[AREA_PROPS.relatedProjects]).length,
    relatedTaskCount: relationIds(props[AREA_PROPS.relatedTasks]).length,
    domain: areaDomain(name),
  };
}

export function adaptProject(
  page: NotionRawPage,
  areaNames: ReadonlyMap<string, string>,
  today: string,
): NotionProject {
  const props = page.properties;
  const name = titlePlain(props[PROJECT_PROPS.title]);
  const status =
    inList(selectName(props[PROJECT_PROPS.status]), PROJECT_STATUSES) ??
    ('Activo' as NotionProjectStatus);
  const dueDate = dateStart(props[PROJECT_PROPS.dueDate]);
  const areaIds = relationIds(props[PROJECT_PROPS.area]);
  return {
    id: page.id,
    name,
    status,
    area: resolveRelation(areaIds, areaNames),
    expectedResult: richTextPlain(props[PROJECT_PROPS.expectedResult]),
    nextAction: richTextPlain(props[PROJECT_PROPS.nextAction]),
    dueDate,
    dateKind: projectDateKind(status, dueDate, today),
    reviewDate: dateStart(props[PROJECT_PROPS.reviewDate]),
    blocker: richTextPlain(props[PROJECT_PROPS.blocker]),
    relatedTaskCount: relationIds(props[PROJECT_PROPS.relatedTasks]).length,
    domain: areaDomain(resolveRelation(areaIds, areaNames)?.name ?? name),
  };
}

export function adaptTask(
  page: NotionRawPage,
  projectNames: ReadonlyMap<string, string>,
  areaNames: ReadonlyMap<string, string>,
  today: string,
): NotionTask {
  const props = page.properties;
  const title = titlePlain(props[TASK_PROPS.title]);
  const status =
    inList(selectName(props[TASK_PROPS.status]), TASK_STATUSES) ??
    ('Pendiente' as NotionTaskStatus);
  const date = dateStart(props[TASK_PROPS.date]);
  const projectIds = relationIds(props[TASK_PROPS.project]);
  const areaIds = relationIds(props[TASK_PROPS.area]);
  const projectAreaIds = relationIds(props[TASK_PROPS.projectArea]);
  const area = resolveRelation(areaIds, areaNames);
  return {
    id: page.id,
    title,
    status,
    date,
    dateKind: taskDateKind(status, date, today),
    priority: inList(
      selectName(props[TASK_PROPS.priority]),
      TASK_PRIORITIES,
    ) as NotionTaskPriority | null,
    duration: inList(
      selectName(props[TASK_PROPS.duration]),
      TASK_DURATIONS,
    ) as NotionTaskDuration | null,
    energy: inList(selectName(props[TASK_PROPS.energy]), TASK_ENERGIES) as NotionTaskEnergy | null,
    project: resolveRelation(projectIds, projectNames),
    area,
    projectArea: resolveRelation(projectAreaIds, areaNames),
    blocker: richTextPlain(props[TASK_PROPS.blocker]),
    note: richTextPlain(props[TASK_PROPS.note]),
    domain: areaDomain(area?.name ?? 'Personal'),
  };
}

export function buildNameMap(pages: readonly { id: string; name: string }[]): Map<string, string> {
  return new Map(pages.map((page) => [page.id, page.name]));
}
