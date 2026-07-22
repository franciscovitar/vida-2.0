/**
 * Puerto real de escritura de Tareas Notion (create / get / status / compat).
 */
import {
  adaptArea,
  adaptProject,
  adaptTask,
  buildNameMap,
  type NotionRawPage,
} from '@/lib/notion/adapters';
import { CANONICAL_AREAS, resolveCanonicalSlugFromArea } from '@/lib/areas/canonical';
import {
  createNotionActionsClient,
  dateProp,
  readRelationIds,
  readSelectName,
  relationProp,
  richTextProp,
  selectProp,
  titleProp,
  type NotionActionsClient,
} from '@/lib/actions/notion-client';
import { opaqueKey } from '@/lib/actions/opaque';
import type { NotionTaskWritePort, TaskSnapshot } from '@/lib/actions/ports';
import { PROJECT_PROPS, TASK_PROPS, TASK_STATUSES } from '@/lib/notion/constants';
import type { TaskChangeStatusPayload, TaskCreatePayload } from '@/types/actions';

export type NotionTaskWriteDeps = {
  client: NotionActionsClient;
  tasksDataSourceId: string;
  projectsDataSourceId: string;
  areasDataSourceId: string;
  today?: () => string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function pageMatchesOpaque(prefix: string, pageId: string, key: string): boolean {
  return opaqueKey(prefix, pageId) === key;
}

function resolveAreaPage(areas: readonly NotionRawPage[], areaKey: string): NotionRawPage | null {
  for (const page of areas) {
    if (pageMatchesOpaque('area', page.id, areaKey)) return page;
  }
  const adapted = areas.map((page) => adaptArea(page));
  for (const def of CANONICAL_AREAS) {
    if (def.stableKey === areaKey || `area.${def.slug}` === areaKey) {
      const match = adapted.find((area) => resolveCanonicalSlugFromArea(area) === def.slug);
      if (match) {
        return areas.find((page) => page.id === match.id) ?? null;
      }
    }
  }
  return null;
}

function resolveProjectPage(
  projects: readonly NotionRawPage[],
  projectKey: string,
): NotionRawPage | null {
  for (const page of projects) {
    if (pageMatchesOpaque('proj', page.id, projectKey)) return page;
  }
  return null;
}

function toSnapshot(
  page: NotionRawPage,
  projectNames: ReadonlyMap<string, string>,
  areaNames: ReadonlyMap<string, string>,
  today: string,
): TaskSnapshot {
  const task = adaptTask(page, projectNames, areaNames, today);
  return {
    key: opaqueKey('task', page.id),
    title: task.title,
    status: task.status,
    areaKey: task.area ? opaqueKey('area', task.area.id) : '',
    projectKey: task.project ? opaqueKey('proj', task.project.id) : null,
    projectAreaKey: task.projectArea ? opaqueKey('area', task.projectArea.id) : null,
  };
}

export function createNotionTaskWritePort(deps: NotionTaskWriteDeps): NotionTaskWritePort {
  const today = deps.today ?? todayIso;

  async function loadMaps(): Promise<{
    areas: NotionRawPage[];
    projects: NotionRawPage[];
    areaNames: Map<string, string>;
    projectNames: Map<string, string>;
  } | null> {
    const [areasRes, projectsRes] = await Promise.all([
      deps.client.queryDataSource(deps.areasDataSourceId),
      deps.client.queryDataSource(deps.projectsDataSourceId),
    ]);
    if (!areasRes.ok || !projectsRes.ok) return null;
    const areasAdapted = areasRes.pages.map((page) => adaptArea(page));
    const projectsAdapted = projectsRes.pages.map((page) =>
      adaptProject(page, buildNameMap(areasAdapted), today()),
    );
    return {
      areas: areasRes.pages,
      projects: projectsRes.pages,
      areaNames: buildNameMap(areasAdapted),
      projectNames: buildNameMap(projectsAdapted),
    };
  }

  return {
    async resolveAreaProjectCompatibility(areaKey, projectKey) {
      if (!projectKey) return { ok: true };
      const maps = await loadMaps();
      if (!maps) {
        return { ok: false, message: 'No se pudo verificar Área–Proyecto.' };
      }
      const areaPage = resolveAreaPage(maps.areas, areaKey);
      const projectPage = resolveProjectPage(maps.projects, projectKey);
      if (!areaPage || !projectPage) {
        return { ok: false, message: 'Área o Proyecto no autorizado.' };
      }
      const projectAreaIds = readRelationIds(projectPage.properties[PROJECT_PROPS.area]);
      if (projectAreaIds.length === 0) {
        return { ok: false, message: 'Relación Área–Proyecto indeterminada.' };
      }
      if (!projectAreaIds.includes(areaPage.id)) {
        return { ok: false, message: 'Área incompatible con el Proyecto.' };
      }
      return { ok: true };
    },

    async createTask(payload: TaskCreatePayload, meta) {
      const maps = await loadMaps();
      if (!maps) {
        return { ok: false, code: 'failed', message: 'No se pudo leer Áreas/Proyectos.' };
      }
      const areaPage = resolveAreaPage(maps.areas, payload.areaKey);
      if (!areaPage) {
        return { ok: false, code: 'invalid-payload', message: 'Área no autorizada.' };
      }
      let projectPage: NotionRawPage | null = null;
      if (payload.projectKey) {
        projectPage = resolveProjectPage(maps.projects, payload.projectKey);
        if (!projectPage) {
          return { ok: false, code: 'invalid-payload', message: 'Proyecto no autorizado.' };
        }
        const projectAreaIds = readRelationIds(projectPage.properties[PROJECT_PROPS.area]);
        if (!projectAreaIds.includes(areaPage.id)) {
          return {
            ok: false,
            code: 'invalid-payload',
            message: 'Área incompatible con el Proyecto.',
          };
        }
      }

      const properties: Record<string, unknown> = {
        [TASK_PROPS.title]: titleProp(payload.title),
        [TASK_PROPS.status]: selectProp('Pendiente'),
        [TASK_PROPS.priority]: selectProp(payload.priority),
        [TASK_PROPS.area]: relationProp([areaPage.id]),
      };
      if (payload.date) properties[TASK_PROPS.date] = dateProp(payload.date);
      if (payload.duration) properties[TASK_PROPS.duration] = selectProp(payload.duration);
      if (payload.energy) properties[TASK_PROPS.energy] = selectProp(payload.energy);
      if (payload.note) properties[TASK_PROPS.note] = richTextProp(payload.note);
      if (projectPage) {
        properties[TASK_PROPS.project] = relationProp([projectPage.id]);
        properties[TASK_PROPS.projectArea] = relationProp([areaPage.id]);
      }

      const created = await deps.client.createPage({
        dataSourceId: deps.tasksDataSourceId,
        properties,
      });
      if (!created.ok) {
        return { ok: false, code: 'failed', message: created.message };
      }

      const verified = await deps.client.retrievePage(created.page.id);
      if (!verified.ok) {
        return {
          ok: false,
          code: 'verification-failed',
          message: 'No se pudo verificar la tarea.',
        };
      }
      const snapshot = toSnapshot(verified.page, maps.projectNames, maps.areaNames, today());
      if (snapshot.title !== payload.title || snapshot.status !== 'Pendiente') {
        return {
          ok: false,
          code: 'verification-failed',
          message: 'Verificación de tarea fallida.',
        };
      }
      // meta.idempotencyKey disponible para ledger externo; no se expone el page id.
      void meta;
      return { ok: true, key: snapshot.key };
    },

    async getTask(key) {
      const maps = await loadMaps();
      if (!maps) return null;
      const tasksRes = await deps.client.queryDataSource(deps.tasksDataSourceId);
      if (!tasksRes.ok) return null;
      const page = tasksRes.pages.find((candidate) => pageMatchesOpaque('task', candidate.id, key));
      if (!page) return null;
      return toSnapshot(page, maps.projectNames, maps.areaNames, today());
    },

    async updateTaskStatus(
      key: string,
      nextStatus: TaskChangeStatusPayload['nextStatus'],
      expectedPrevious: string,
    ) {
      if (!(TASK_STATUSES as readonly string[]).includes(nextStatus)) {
        return { ok: false, code: 'invalid-payload', message: 'Estado no permitido.' };
      }
      const maps = await loadMaps();
      if (!maps) {
        return { ok: false, code: 'failed', message: 'No se pudo leer tareas.' };
      }
      const tasksRes = await deps.client.queryDataSource(deps.tasksDataSourceId);
      if (!tasksRes.ok) {
        return { ok: false, code: 'failed', message: tasksRes.message };
      }
      const page = tasksRes.pages.find((candidate) => pageMatchesOpaque('task', candidate.id, key));
      if (!page) {
        return { ok: false, code: 'not-found', message: 'Tarea no encontrada.' };
      }
      const current = readSelectName(page.properties[TASK_PROPS.status]) ?? 'Pendiente';
      if (current !== expectedPrevious) {
        return { ok: false, code: 'conflict', message: 'Estado previo distinto al esperado.' };
      }
      const updated = await deps.client.updatePage(page.id, {
        [TASK_PROPS.status]: selectProp(nextStatus),
      });
      if (!updated.ok) {
        return { ok: false, code: 'failed', message: updated.message };
      }
      const after = readSelectName(updated.page.properties[TASK_PROPS.status]);
      if (after !== nextStatus) {
        return { ok: false, code: 'verification-failed', message: 'Estado no verificado.' };
      }
      return { ok: true };
    },
  };
}

export function createNotionTaskWritePortFromToken(input: {
  token: string;
  tasksDataSourceId: string;
  projectsDataSourceId: string;
  areasDataSourceId: string;
}): NotionTaskWritePort {
  return createNotionTaskWritePort({
    client: createNotionActionsClient(input.token),
    tasksDataSourceId: input.tasksDataSourceId,
    projectsDataSourceId: input.projectsDataSourceId,
    areasDataSourceId: input.areasDataSourceId,
  });
}
