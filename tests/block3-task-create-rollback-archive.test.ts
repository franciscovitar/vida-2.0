/**
 * Regresión: el rollback de `task.create` debe ARCHIVAR realmente la página de
 * Notion (papelera), no cambiar su Estado a "Algún día".
 *
 * Incidente Production: la tarea QA creada por Vida terminó con Estado = "Algún
 * día", que `/tareas` sigue mostrando, aunque el ledger la registró como
 * `rolled-back`. La causa: `archiveOwnedTask` hacía `pages.update` de Status en
 * vez de archivar la página.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compensateBusiness } from '@/lib/actions/handlers';
import {
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import { opaqueKey } from '@/lib/actions/opaque';
import {
  readSelectName,
  type NotionActionsClient,
  type NotionPageResult,
} from '@/lib/actions/notion-client';
import { createNotionTaskWritePort } from '@/lib/actions/notion-tasks';
import { TASK_PROPS } from '@/lib/notion/constants';

const OWNERSHIP_PROP = 'Vida2 Ownership';

function richTextValue(text: string) {
  return { rich_text: [{ plain_text: text, text: { content: text } }] };
}

/** Cliente Notion mínimo real-like: un store de páginas con flag de papelera. */
function createFakeNotionClient(options?: {
  /** `pages.update` con in_trash devuelve `archived` (true por defecto). */
  archiveVerifiable?: boolean;
  /** `archivePage` falla a nivel de proveedor. */
  archiveFails?: boolean;
}) {
  const pages = new Map<string, NotionPageResult>();

  pages.set('area-salud', {
    id: 'area-salud',
    properties: { Área: { title: [{ plain_text: 'Salud', text: { content: 'Salud' } }] } },
  });

  function seedTask(id: string, ownership: string, status = 'Pendiente'): string {
    pages.set(id, {
      id,
      properties: {
        [TASK_PROPS.title]: { title: [{ plain_text: 'Tarea QA', text: { content: 'Tarea QA' } }] },
        [TASK_PROPS.status]: { select: { name: status } },
        [OWNERSHIP_PROP]: richTextValue(ownership),
      },
    });
    return opaqueKey('task', id);
  }

  const client: NotionActionsClient = {
    async queryDataSource(dataSourceId) {
      if (dataSourceId === 'areas') {
        return {
          ok: true,
          pages: [{ id: 'area-salud', properties: pages.get('area-salud')!.properties }],
        };
      }
      if (dataSourceId === 'projects') return { ok: true, pages: [] };
      return {
        ok: true,
        pages: [...pages.values()]
          .filter((page) => page.id.startsWith('task-') && !page.archived)
          .map((page) => ({ id: page.id, properties: page.properties })),
      };
    },
    async createPage() {
      return { ok: false, message: 'no usado' };
    },
    async updatePage(pageId, properties) {
      const page = pages.get(pageId);
      if (!page) return { ok: false, message: 'missing' };
      const next: NotionPageResult = {
        id: pageId,
        properties: { ...page.properties, ...properties },
        archived: page.archived,
      };
      pages.set(pageId, next);
      return { ok: true, page: next };
    },
    async retrievePage(pageId) {
      const page = pages.get(pageId);
      return page ? { ok: true, page } : { ok: false, message: 'missing' };
    },
    async archivePage(pageId) {
      if (options?.archiveFails) return { ok: false, message: 'proveedor no disponible' };
      const page = pages.get(pageId);
      if (!page) return { ok: false, message: 'missing' };
      const verifiable = options?.archiveVerifiable ?? true;
      pages.set(pageId, { ...page, archived: verifiable });
      return { ok: true, archived: verifiable };
    },
    async appendBlockChildren() {
      return { ok: false, message: 'no usado' };
    },
    async retrieveBlock() {
      return { ok: false, message: 'no usado' };
    },
    async archiveBlock() {
      return { ok: false, message: 'no usado' };
    },
  };

  const port = createNotionTaskWritePort({
    client,
    tasksDataSourceId: 'tasks',
    projectsDataSourceId: 'projects',
    areasDataSourceId: 'areas',
    ownershipProperty: OWNERSHIP_PROP,
  });

  return { pages, port, seedTask };
}

test('rollback task.create (real port): archiva la PAGE, no cambia a "Algún día"', async () => {
  const { pages, port, seedTask } = createFakeNotionClient();
  const ownership = 'abcdabcdabcdabcdabcdabcd';
  const key = seedTask('task-1', ownership);

  const result = await port.archiveOwnedTask(key, ownership);
  assert.equal(result.ok, true);

  const page = pages.get('task-1');
  assert.equal(page?.archived, true, 'la página quedó en la papelera');
  assert.equal(
    readSelectName(page?.properties[TASK_PROPS.status]),
    'Pendiente',
    'el Estado no fue tocado (no se usó "Algún día" como pseudo-archivo)',
  );
  assert.equal(await port.getTask(key), null, 'getTask ya no devuelve una tarea activa');
});

test('rollback task.create (real port): ownership incorrecto no archiva', async () => {
  const { pages, port, seedTask } = createFakeNotionClient();
  const key = seedTask('task-1', 'realrealrealrealrealreal');

  const denied = await port.archiveOwnedTask(key, 'wrongwrongwrongwrongwron');
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, 'ownership-mismatch');
  assert.equal(pages.get('task-1')?.archived, undefined);
  assert.ok(await port.getTask(key), 'la tarea sigue activa');
});

test('rollback task.create (real port): sin verificación de archivo → ok:false', async () => {
  const { pages, port, seedTask } = createFakeNotionClient({ archiveVerifiable: false });
  const ownership = 'abcdabcdabcdabcdabcdabcd';
  const key = seedTask('task-1', ownership);

  const result = await port.archiveOwnedTask(key, ownership);
  assert.equal(result.ok, false, 'no puede confirmarse que la página quedó archivada');
  if (!result.ok) assert.equal(result.code, 'verification-failed');
  assert.notEqual(pages.get('task-1')?.archived, true);
});

test('rollback task.create (real port): fallo del proveedor al archivar → ok:false', async () => {
  const { port, seedTask } = createFakeNotionClient({ archiveFails: true });
  const ownership = 'abcdabcdabcdabcdabcdabcd';
  const key = seedTask('task-1', ownership);

  const result = await port.archiveOwnedTask(key, ownership);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'failed');
});

function handlerDeps(overrides?: { failVerify?: boolean }) {
  return {
    tasks: createMemoryTaskPort({
      areaProjectMap: {},
      authorizedAreas: ['area.salud'],
      failVerify: overrides?.failVerify,
    }),
    inbox: createMemoryInboxPort(),
    gym: createMemoryGymPort(),
    proposals: createMemoryProposalPort(),
  };
}

test('compensateBusiness(task.create): éxito solo si la compensación real archiva', async () => {
  const deps = handlerDeps();
  const created = await deps.tasks.createTask(
    {
      title: 'QA',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'idem-ok' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const compensated = await compensateBusiness({
    actionType: 'task.create',
    targetKey: created.key,
    ownership: created.ownership,
    deps,
  });
  assert.equal(compensated.ok, true);
  assert.equal(await deps.tasks.getTask(created.key), null);
});

test('compensateBusiness(task.create): archivo no verificable → rollback NO exitoso', async () => {
  const deps = handlerDeps({ failVerify: true });
  const created = await deps.tasks.createTask(
    {
      title: 'QA',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'idem-fail' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const compensated = await compensateBusiness({
    actionType: 'task.create',
    targetKey: created.key,
    ownership: created.ownership,
    deps,
  });
  assert.equal(compensated.ok, false);
  assert.ok(
    await deps.tasks.getTask(created.key),
    'la tarea permanece activa si el rollback falla',
  );
});
