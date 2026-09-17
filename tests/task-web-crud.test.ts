import assert from 'node:assert/strict';
import test from 'node:test';

import type { NotionActionsClient } from '@/lib/actions/notion-client';
import { opaqueKey } from '@/lib/actions/opaque';
import { PROJECT_PROPS, TASK_PROPS } from '@/lib/notion/constants';
import type { NotionRawPage } from '@/lib/notion/adapters';
import { createPlanningTaskCrudService } from '@/lib/tasks/web-crud';
import type { PlanningTaskEditableSnapshot } from '@/types/planning';

function title(value: string) {
  return { title: [{ type: 'text', text: { content: value }, plain_text: value }] };
}

function rich(value: string) {
  return { rich_text: [{ type: 'text', text: { content: value }, plain_text: value }] };
}

function select(value: string) {
  return { select: { name: value } };
}

function relation(ids: string[]) {
  return { relation: ids.map((id) => ({ id })) };
}

function normalizeProperty(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = structuredClone(value) as Record<string, unknown>;
  for (const key of ['title', 'rich_text']) {
    const parts = record[key];
    if (!Array.isArray(parts)) continue;
    record[key] = parts.map((part) => {
      if (!part || typeof part !== 'object') return part;
      const next = { ...(part as Record<string, unknown>) };
      const textValue = next.text;
      if (textValue && typeof textValue === 'object') {
        const content = (textValue as Record<string, unknown>).content;
        if (typeof content === 'string') next.plain_text = content;
      }
      return next;
    });
  }
  return record;
}

function normalizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, normalizeProperty(value)]),
  );
}

function fakeClient() {
  const ids = { tasks: 'tasks', projects: 'projects', areas: 'areas' };
  const area: NotionRawPage = {
    id: 'area-1',
    properties: { Área: title('Vida personal') },
  };
  const project: NotionRawPage = {
    id: 'project-1',
    properties: {
      [PROJECT_PROPS.title]: title('Finance OS V1'),
      [PROJECT_PROPS.area]: relation([area.id]),
    },
  };
  let counter = 0;
  const tasks = new Map<string, NotionRawPage>();
  let createCalls = 0;

  const client: NotionActionsClient = {
    async queryDataSource(dataSourceId) {
      if (dataSourceId === ids.tasks) return { ok: true, pages: [...tasks.values()] };
      if (dataSourceId === ids.projects) return { ok: true, pages: [project] };
      if (dataSourceId === ids.areas) return { ok: true, pages: [area] };
      return { ok: false, message: 'unknown' };
    },
    async createPage(input) {
      createCalls += 1;
      const id = `task-${++counter}`;
      const page = { id, properties: normalizeProperties(input.properties) };
      tasks.set(id, page);
      return { ok: true, page };
    },
    async updatePage(pageId, properties) {
      const page = tasks.get(pageId);
      if (!page) return { ok: false, message: 'missing' };
      const next = {
        id: page.id,
        properties: { ...page.properties, ...normalizeProperties(properties) },
      };
      tasks.set(pageId, next);
      return { ok: true, page: next };
    },
    async retrievePage(pageId) {
      const page = tasks.get(pageId);
      return page ? { ok: true, page } : { ok: false, message: 'missing' };
    },
    async archivePage(pageId) {
      if (!tasks.has(pageId)) return { ok: false, message: 'missing' };
      tasks.delete(pageId);
      return { ok: true, archived: true };
    },
    async appendBlockChildren() {
      return { ok: false, message: 'unused' };
    },
    async retrieveBlock() {
      return { ok: false, message: 'unused' };
    },
    async archiveBlock() {
      return { ok: false, message: 'unused' };
    },
  };

  return {
    ids,
    area,
    project,
    tasks,
    client,
    createCalls: () => createCalls,
  };
}

function editable(input: Partial<PlanningTaskEditableSnapshot> = {}): PlanningTaskEditableSnapshot {
  return {
    title: 'Revisar presupuesto',
    status: 'Pendiente',
    date: null,
    priority: 'Media',
    duration: null,
    energy: null,
    areaKey: opaqueKey('area', 'area-1'),
    projectKey: opaqueKey('proj', 'project-1'),
    blocker: null,
    note: null,
    ...input,
  };
}

test('Task Web CRUD: create + exact replay creates only one canonical task', async () => {
  const fake = fakeClient();
  const service = createPlanningTaskCrudService({
    client: fake.client,
    tasksDataSourceId: fake.ids.tasks,
    projectsDataSourceId: fake.ids.projects,
    areasDataSourceId: fake.ids.areas,
  });

  const input = {
    operationId: 'op-1',
    title: 'Revisar presupuesto',
    priority: 'Media' as const,
    areaKey: opaqueKey('area', fake.area.id),
    projectKey: opaqueKey('proj', fake.project.id),
    date: null,
    duration: null,
    energy: null,
    note: null,
  };

  const first = await service.create(input);
  const replay = await service.create(input);

  assert.deepEqual(first, { ok: true, code: 'applied', message: 'Tarea creada y verificada.' });
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.code, 'idempotent');
  assert.equal(fake.createCalls(), 1);
  assert.equal(fake.tasks.size, 1);
});

test('Task Web CRUD: update uses CAS and replay is idempotent', async () => {
  const fake = fakeClient();
  const task: NotionRawPage = {
    id: 'task-existing',
    properties: {
      [TASK_PROPS.title]: title('Revisar presupuesto'),
      [TASK_PROPS.status]: select('Pendiente'),
      [TASK_PROPS.priority]: select('Media'),
      [TASK_PROPS.area]: relation([fake.area.id]),
      [TASK_PROPS.project]: relation([fake.project.id]),
      [TASK_PROPS.projectArea]: relation([fake.area.id]),
    },
  };
  fake.tasks.set(task.id, task);

  const service = createPlanningTaskCrudService({
    client: fake.client,
    tasksDataSourceId: fake.ids.tasks,
    projectsDataSourceId: fake.ids.projects,
    areasDataSourceId: fake.ids.areas,
  });
  const expected = editable();
  const next = editable({ status: 'En progreso', priority: 'Alta', note: 'Hoy' });
  const input = { taskKey: opaqueKey('task', task.id), expected, next };

  const first = await service.update(input);
  const replay = await service.update(input);

  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.code, 'applied');
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.code, 'idempotent');
});

test('Task Web CRUD: stale editor conflicts instead of overwriting newer state', async () => {
  const fake = fakeClient();
  const task: NotionRawPage = {
    id: 'task-existing',
    properties: {
      [TASK_PROPS.title]: title('Revisar presupuesto'),
      [TASK_PROPS.status]: select('En progreso'),
      [TASK_PROPS.priority]: select('Alta'),
      [TASK_PROPS.area]: relation([fake.area.id]),
      [TASK_PROPS.project]: relation([fake.project.id]),
      [TASK_PROPS.projectArea]: relation([fake.area.id]),
    },
  };
  fake.tasks.set(task.id, task);
  const service = createPlanningTaskCrudService({
    client: fake.client,
    tasksDataSourceId: fake.ids.tasks,
    projectsDataSourceId: fake.ids.projects,
    areasDataSourceId: fake.ids.areas,
  });

  const result = await service.update({
    taskKey: opaqueKey('task', task.id),
    expected: editable(),
    next: editable({ status: 'Hecha' }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'conflict');
  assert.equal((fake.tasks.get(task.id)!.properties[TASK_PROPS.status] as { select: { name: string } }).select.name, 'En progreso');
});

test('Task Web CRUD: archive requires exact confirmation context and removes active row', async () => {
  const fake = fakeClient();
  const task: NotionRawPage = {
    id: 'task-existing',
    properties: {
      [TASK_PROPS.title]: title('Revisar presupuesto'),
      [TASK_PROPS.status]: select('Pendiente'),
      [TASK_PROPS.priority]: select('Media'),
      [TASK_PROPS.area]: relation([fake.area.id]),
    },
  };
  fake.tasks.set(task.id, task);
  const service = createPlanningTaskCrudService({
    client: fake.client,
    tasksDataSourceId: fake.ids.tasks,
    projectsDataSourceId: fake.ids.projects,
    areasDataSourceId: fake.ids.areas,
  });

  const result = await service.archive({
    taskKey: opaqueKey('task', task.id),
    expectedTitle: 'Revisar presupuesto',
    expectedStatus: 'Pendiente',
    confirmation: 'eliminar',
  });

  assert.equal(result.ok, true);
  assert.equal(fake.tasks.size, 0);
});
