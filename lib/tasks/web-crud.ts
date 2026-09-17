import 'server-only';

import { createHash } from 'node:crypto';

import {
  createNotionActionsClient,
  dateProp,
  readDateStart,
  readRelationIds,
  readRichText,
  readSelectName,
  readTitle,
  relationProp,
  richTextProp,
  selectProp,
  titleProp,
  type NotionActionsClient,
} from '@/lib/actions/notion-client';
import { opaqueKey } from '@/lib/actions/opaque';
import {
  PROJECT_PROPS,
  TASK_DURATIONS,
  TASK_ENERGIES,
  TASK_PRIORITIES,
  TASK_PROPS,
  TASK_STATUSES,
} from '@/lib/notion/constants';
import { getNotionConfig } from '@/lib/notion/config';
import type { NotionRawPage } from '@/lib/notion/adapters';
import type {
  PlanningTaskArchiveInput,
  PlanningTaskCreateInput,
  PlanningTaskEditableSnapshot,
  PlanningTaskMutationResult,
  PlanningTaskUpdateInput,
} from '@/types/planning';

function clearRichText(): Record<string, unknown> {
  return { rich_text: [] };
}

function clearSelect(): Record<string, unknown> {
  return { select: null };
}

function taskOwnership(operationId: string): string {
  return `vida2:task-web:v1:${createHash('sha256')
    .update(operationId.trim())
    .digest('hex')
    .slice(0, 32)}`;
}

function findOpaque(pages: readonly NotionRawPage[], prefix: string, key: string): NotionRawPage | null {
  return pages.find((page) => opaqueKey(prefix, page.id) === key) ?? null;
}

function snapshot(
  page: NotionRawPage,
  projects: readonly NotionRawPage[],
  areas: readonly NotionRawPage[],
): PlanningTaskEditableSnapshot {
  const areaId = readRelationIds(page.properties[TASK_PROPS.area])[0] ?? null;
  const projectId = readRelationIds(page.properties[TASK_PROPS.project])[0] ?? null;
  return {
    title: readTitle(page.properties[TASK_PROPS.title]),
    status:
      (readSelectName(page.properties[TASK_PROPS.status]) as PlanningTaskEditableSnapshot['status']) ??
      'Pendiente',
    date: readDateStart(page.properties[TASK_PROPS.date]),
    priority: readSelectName(
      page.properties[TASK_PROPS.priority],
    ) as PlanningTaskEditableSnapshot['priority'],
    duration: readSelectName(
      page.properties[TASK_PROPS.duration],
    ) as PlanningTaskEditableSnapshot['duration'],
    energy: readSelectName(
      page.properties[TASK_PROPS.energy],
    ) as PlanningTaskEditableSnapshot['energy'],
    areaKey: areaId && areas.some((item) => item.id === areaId) ? opaqueKey('area', areaId) : null,
    projectKey:
      projectId && projects.some((item) => item.id === projectId) ? opaqueKey('proj', projectId) : null,
    blocker: readRichText(page.properties[TASK_PROPS.blocker]) || null,
    note: readRichText(page.properties[TASK_PROPS.note]) || null,
  };
}

function equalSnapshot(a: PlanningTaskEditableSnapshot, b: PlanningTaskEditableSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateSnapshot(value: PlanningTaskEditableSnapshot): string | null {
  const title = value.title.trim();
  if (title.length < 3 || title.length > 200) return 'El título debe tener entre 3 y 200 caracteres.';
  if (!(TASK_STATUSES as readonly string[]).includes(value.status)) return 'Estado inválido.';
  if (value.priority && !(TASK_PRIORITIES as readonly string[]).includes(value.priority)) {
    return 'Prioridad inválida.';
  }
  if (value.duration && !(TASK_DURATIONS as readonly string[]).includes(value.duration)) {
    return 'Duración inválida.';
  }
  if (value.energy && !(TASK_ENERGIES as readonly string[]).includes(value.energy)) {
    return 'Energía inválida.';
  }
  if (value.date && !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return 'Fecha inválida.';
  return null;
}

type CrudDeps = {
  client: NotionActionsClient;
  tasksDataSourceId: string;
  projectsDataSourceId: string;
  areasDataSourceId: string;
};

async function loadCanonical(deps: CrudDeps) {
  const [tasks, projects, areas] = await Promise.all([
    deps.client.queryDataSource(deps.tasksDataSourceId),
    deps.client.queryDataSource(deps.projectsDataSourceId),
    deps.client.queryDataSource(deps.areasDataSourceId),
  ]);
  if (!tasks.ok || !projects.ok || !areas.ok) return null;
  return { tasks: tasks.pages, projects: projects.pages, areas: areas.pages };
}

function resolveRelations(
  canonical: NonNullable<Awaited<ReturnType<typeof loadCanonical>>>,
  areaKey: string | null,
  projectKey: string | null,
):
  | { ok: true; area: NotionRawPage | null; project: NotionRawPage | null }
  | { ok: false; message: string } {
  const area = areaKey ? findOpaque(canonical.areas, 'area', areaKey) : null;
  if (areaKey && !area) return { ok: false, message: 'Área no válida o desactualizada.' };
  const project = projectKey ? findOpaque(canonical.projects, 'proj', projectKey) : null;
  if (projectKey && !project) return { ok: false, message: 'Proyecto no válido o desactualizado.' };
  if (project) {
    if (!area) return { ok: false, message: 'Un proyecto requiere un área compatible.' };
    const projectAreaIds = readRelationIds(project.properties[PROJECT_PROPS.area]);
    if (!projectAreaIds.includes(area.id)) {
      return { ok: false, message: 'El proyecto no pertenece al área seleccionada.' };
    }
  }
  return { ok: true, area, project };
}

function verifyExpected(
  current: PlanningTaskEditableSnapshot,
  expected: PlanningTaskEditableSnapshot,
): boolean {
  return equalSnapshot(current, expected);
}

export function createPlanningTaskCrudService(deps: CrudDeps) {
  return {
    async create(input: PlanningTaskCreateInput): Promise<PlanningTaskMutationResult> {
      const operationId = input.operationId.trim();
      if (!operationId) return { ok: false, code: 'invalid', message: 'Operación inválida.' };
      const proposed: PlanningTaskEditableSnapshot = {
        title: input.title.trim(),
        status: 'Pendiente',
        date: input.date,
        priority: input.priority,
        duration: input.duration,
        energy: input.energy,
        areaKey: input.areaKey,
        projectKey: input.projectKey,
        blocker: null,
        note: input.note?.trim() || null,
      };
      const validation = validateSnapshot(proposed);
      if (validation) return { ok: false, code: 'invalid', message: validation };

      const canonical = await loadCanonical(deps);
      if (!canonical) return { ok: false, code: 'unavailable', message: 'No se pudo verificar Tareas.' };
      const ownership = taskOwnership(operationId);
      const owned = canonical.tasks.filter(
        (page) => readRichText(page.properties[TASK_PROPS.ownership]) === ownership,
      );
      if (owned.length > 1) {
        return { ok: false, code: 'conflict', message: 'Ownership duplicado; no se escribió.' };
      }
      if (owned.length === 1) {
        const current = snapshot(owned[0]!, canonical.projects, canonical.areas);
        if (equalSnapshot(current, proposed)) {
          return { ok: true, code: 'idempotent', message: 'La tarea ya estaba guardada; no se duplicó.' };
        }
        return { ok: false, code: 'conflict', message: 'La operación ya existe con otro payload.' };
      }

      const relations = resolveRelations(canonical, proposed.areaKey, proposed.projectKey);
      if (!relations.ok) return { ok: false, code: 'invalid', message: relations.message };
      if (!relations.area) return { ok: false, code: 'invalid', message: 'Área requerida.' };

      const properties: Record<string, unknown> = {
        [TASK_PROPS.title]: titleProp(proposed.title),
        [TASK_PROPS.status]: selectProp('Pendiente'),
        [TASK_PROPS.priority]: selectProp(proposed.priority!),
        [TASK_PROPS.area]: relationProp([relations.area.id]),
        [TASK_PROPS.ownership]: richTextProp(ownership),
      };
      if (proposed.date) properties[TASK_PROPS.date] = dateProp(proposed.date);
      if (proposed.duration) properties[TASK_PROPS.duration] = selectProp(proposed.duration);
      if (proposed.energy) properties[TASK_PROPS.energy] = selectProp(proposed.energy);
      if (proposed.note) properties[TASK_PROPS.note] = richTextProp(proposed.note);
      if (relations.project) {
        properties[TASK_PROPS.project] = relationProp([relations.project.id]);
        properties[TASK_PROPS.projectArea] = relationProp([relations.area.id]);
      }

      const created = await deps.client.createPage({
        dataSourceId: deps.tasksDataSourceId,
        properties,
      });
      if (!created.ok) {
        return { ok: false, code: 'unavailable', message: 'No se pudo crear la tarea.' };
      }
      const readBack = await deps.client.retrievePage(created.page.id);
      if (!readBack.ok) {
        return { ok: false, code: 'verification-failed', message: 'No pude verificar la creación.' };
      }
      const after = snapshot(readBack.page, canonical.projects, canonical.areas);
      if (
        !equalSnapshot(after, proposed) ||
        readRichText(readBack.page.properties[TASK_PROPS.ownership]) !== ownership
      ) {
        return { ok: false, code: 'verification-failed', message: 'La tarea creada no coincide con el payload.' };
      }
      return { ok: true, code: 'applied', message: 'Tarea creada y verificada.' };
    },

    async update(input: PlanningTaskUpdateInput): Promise<PlanningTaskMutationResult> {
      const validation = validateSnapshot(input.next);
      if (validation) return { ok: false, code: 'invalid', message: validation };
      const canonical = await loadCanonical(deps);
      if (!canonical) return { ok: false, code: 'unavailable', message: 'No se pudo verificar Tareas.' };
      const page = findOpaque(canonical.tasks, 'task', input.taskKey);
      if (!page) return { ok: false, code: 'not-found', message: 'Tarea no encontrada.' };
      const current = snapshot(page, canonical.projects, canonical.areas);
      if (equalSnapshot(current, input.next)) {
        return { ok: true, code: 'idempotent', message: 'El cambio ya estaba aplicado.' };
      }
      if (!verifyExpected(current, input.expected)) {
        return { ok: false, code: 'conflict', message: 'La tarea cambió desde que abriste el editor. Recargá antes de guardar.' };
      }

      const relations = resolveRelations(canonical, input.next.areaKey, input.next.projectKey);
      if (!relations.ok) return { ok: false, code: 'invalid', message: relations.message };

      const properties: Record<string, unknown> = {};
      const next = input.next;
      const before = input.expected;
      if (next.title !== before.title) properties[TASK_PROPS.title] = titleProp(next.title.trim());
      if (next.status !== before.status) properties[TASK_PROPS.status] = selectProp(next.status);
      if (next.date !== before.date) properties[TASK_PROPS.date] = dateProp(next.date);
      if (next.priority !== before.priority) {
        properties[TASK_PROPS.priority] = next.priority ? selectProp(next.priority) : clearSelect();
      }
      if (next.duration !== before.duration) {
        properties[TASK_PROPS.duration] = next.duration ? selectProp(next.duration) : clearSelect();
      }
      if (next.energy !== before.energy) {
        properties[TASK_PROPS.energy] = next.energy ? selectProp(next.energy) : clearSelect();
      }
      if (next.areaKey !== before.areaKey) {
        properties[TASK_PROPS.area] = relationProp(relations.area ? [relations.area.id] : []);
      }
      if (next.projectKey !== before.projectKey || next.areaKey !== before.areaKey) {
        properties[TASK_PROPS.project] = relationProp(relations.project ? [relations.project.id] : []);
        properties[TASK_PROPS.projectArea] =
          relations.project && relations.area ? relationProp([relations.area.id]) : relationProp([]);
      }
      if (next.blocker !== before.blocker) {
        properties[TASK_PROPS.blocker] = next.blocker ? richTextProp(next.blocker) : clearRichText();
      }
      if (next.note !== before.note) {
        properties[TASK_PROPS.note] = next.note ? richTextProp(next.note) : clearRichText();
      }
      if (Object.keys(properties).length === 0) {
        return { ok: true, code: 'idempotent', message: 'No había cambios para guardar.' };
      }

      const updated = await deps.client.updatePage(page.id, properties);
      if (!updated.ok) return { ok: false, code: 'unavailable', message: 'No se pudo actualizar la tarea.' };
      const readBack = await deps.client.retrievePage(page.id);
      if (!readBack.ok) {
        return { ok: false, code: 'verification-failed', message: 'No pude verificar la actualización.' };
      }
      const after = snapshot(readBack.page, canonical.projects, canonical.areas);
      if (!equalSnapshot(after, next)) {
        return { ok: false, code: 'verification-failed', message: 'La actualización no pudo verificarse.' };
      }
      return { ok: true, code: 'applied', message: 'Tarea actualizada y verificada.' };
    },

    async archive(input: PlanningTaskArchiveInput): Promise<PlanningTaskMutationResult> {
      if (input.confirmation !== 'eliminar') {
        return { ok: false, code: 'invalid', message: 'Confirmación inválida.' };
      }
      const canonical = await loadCanonical(deps);
      if (!canonical) return { ok: false, code: 'unavailable', message: 'No se pudo verificar Tareas.' };
      const page = findOpaque(canonical.tasks, 'task', input.taskKey);
      if (!page) return { ok: false, code: 'not-found', message: 'Tarea no encontrada o ya archivada.' };
      const current = snapshot(page, canonical.projects, canonical.areas);
      if (current.title !== input.expectedTitle || current.status !== input.expectedStatus) {
        return { ok: false, code: 'conflict', message: 'La tarea cambió antes de eliminarse. Recargá y revisá.' };
      }
      const archived = await deps.client.archivePage(page.id);
      if (!archived.ok || !archived.archived) {
        return { ok: false, code: 'verification-failed', message: 'No pude verificar el archivado.' };
      }
      const after = await deps.client.queryDataSource(deps.tasksDataSourceId);
      if (!after.ok) {
        return { ok: false, code: 'verification-failed', message: 'No pude verificar que la tarea salió de la fuente activa.' };
      }
      if (findOpaque(after.pages, 'task', input.taskKey)) {
        return { ok: false, code: 'verification-failed', message: 'La tarea sigue activa después del archivado.' };
      }
      return { ok: true, code: 'applied', message: 'Tarea enviada a la papelera de Notion.' };
    },
  };
}

export function planningTaskCrudFromEnv() {
  const config = getNotionConfig();
  if (!config.ok) return null;
  return createPlanningTaskCrudService({
    client: createNotionActionsClient(config.config.token),
    tasksDataSourceId: config.config.tasksDataSourceId,
    projectsDataSourceId: config.config.projectsDataSourceId,
    areasDataSourceId: config.config.areasDataSourceId,
  });
}
