/**
 * Hotfix 8E.1 — runtime real: adaptadores Notion/Sheets, ledger persistente.
 * Sin I/O real: clientes falsos inyectados.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { createMemoryAuditSink, auditLooksSafe } from '@/lib/actions/audit';
import {
  allowMemoryWritePorts,
  getWriteRuntimeStatus,
  isWriteActionsEnabled,
} from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import {
  createGymSheetWritePort,
  GYM_SESSIONS_HEADERS,
  GYM_SETS_HEADERS,
  gymSetRowCells,
  type SheetsValuesClient,
} from '@/lib/actions/gym-sheets';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import {
  createNotionAuditSink,
  createNotionIdempotencyStore,
  createNotionProposalRepository,
} from '@/lib/actions/notion-ledger';
import type { NotionActionsClient, NotionPageResult } from '@/lib/actions/notion-client';
import { createNotionInboxWritePort } from '@/lib/actions/notion-inbox';
import { createNotionTaskWritePort } from '@/lib/actions/notion-tasks';
import { opaqueKey } from '@/lib/actions/opaque';
import { portHasDestructiveMethods } from '@/lib/actions/ports';
import { buildWriteRuntime } from '@/lib/actions/runtime';
import { NOTION_DATABASES, AREA_PROPS, PROJECT_PROPS, TASK_PROPS } from '@/lib/notion/constants';
import { isForbiddenActionType } from '@/lib/actions/policy';
import type { ActionRequest, ActionResult, ConfirmationMode } from '@/types/actions';
import type { NotionRawPage } from '@/lib/notion/adapters';

const explicit: { mode: ConfirmationMode; acknowledged: boolean; phrase: string | null } = {
  mode: 'explicit',
  acknowledged: true,
  phrase: null,
};

const AREA_ID = 'area-uuid-salud-0001';
const PROJECT_ID = 'proj-uuid-ok-0001';
const ACTIONS_DS = 'actions-ds-test-0001';
const INBOX_PAGE = 'inbox-page-test-0001';

function titleProp(text: string) {
  return { title: [{ type: 'text', plain_text: text, text: { content: text } }] };
}
function selectProp(name: string) {
  return { select: { name } };
}
function relationProp(ids: string[]) {
  return { relation: ids.map((id) => ({ id })) };
}

function createFakeNotionClient(): NotionActionsClient & {
  pages: Map<string, NotionPageResult>;
  blocks: Map<string, Record<string, unknown>[]>;
  createCount: number;
} {
  const pages = new Map<string, NotionPageResult>();
  const blocks = new Map<string, Record<string, unknown>[]>();
  let seq = 0;

  pages.set(AREA_ID, {
    id: AREA_ID,
    properties: {
      [AREA_PROPS.title]: titleProp('Salud'),
      [AREA_PROPS.status]: selectProp('Activa'),
    },
  });
  pages.set(PROJECT_ID, {
    id: PROJECT_ID,
    properties: {
      [PROJECT_PROPS.title]: titleProp('Habitos'),
      [PROJECT_PROPS.status]: selectProp('Activo'),
      [PROJECT_PROPS.area]: relationProp([AREA_ID]),
    },
  });
  pages.set(INBOX_PAGE, {
    id: INBOX_PAGE,
    properties: { title: titleProp('Bandeja') },
  });
  blocks.set(INBOX_PAGE, []);

  function matchFilter(page: NotionPageResult, filter: unknown): boolean {
    if (!filter || typeof filter !== 'object') return true;
    const f = filter as Record<string, unknown>;
    if (Array.isArray(f.and)) {
      return f.and.every((part) => matchFilter(page, part));
    }
    const property = typeof f.property === 'string' ? f.property : '';
    const rich = f.rich_text as { equals?: string } | undefined;
    const select = f.select as { equals?: string } | undefined;
    if (rich?.equals !== undefined) {
      const prop = page.properties[property] as { rich_text?: { plain_text?: string }[] };
      const text = (prop?.rich_text ?? []).map((p) => p.plain_text ?? '').join('');
      return text === rich.equals;
    }
    if (select?.equals !== undefined) {
      const prop = page.properties[property] as { select?: { name?: string } };
      return prop?.select?.name === select.equals;
    }
    return true;
  }

  function normalizeProps(properties: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!value || typeof value !== 'object') {
        out[key] = value;
        continue;
      }
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.title)) {
        out[key] = {
          title: obj.title.map((part) => {
            const p = part as Record<string, unknown>;
            const text = p.text as { content?: string } | undefined;
            const content =
              typeof p.plain_text === 'string'
                ? p.plain_text
                : typeof text?.content === 'string'
                  ? text.content
                  : '';
            return { type: 'text', plain_text: content, text: { content } };
          }),
        };
        continue;
      }
      if (Array.isArray(obj.rich_text)) {
        out[key] = {
          rich_text: obj.rich_text.map((part) => {
            const p = part as Record<string, unknown>;
            const text = p.text as { content?: string } | undefined;
            const content =
              typeof p.plain_text === 'string'
                ? p.plain_text
                : typeof text?.content === 'string'
                  ? text.content
                  : '';
            return { type: 'text', plain_text: content, text: { content } };
          }),
        };
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  const client: NotionActionsClient & {
    pages: Map<string, NotionPageResult>;
    blocks: Map<string, Record<string, unknown>[]>;
    createCount: number;
  } = {
    pages,
    blocks,
    createCount: 0,
    async queryDataSource(dataSourceId, options) {
      const all = [...pages.values()].filter((page) => {
        if (dataSourceId === NOTION_DATABASES.areas.dataSourceId) {
          return page.id === AREA_ID;
        }
        if (dataSourceId === NOTION_DATABASES.projects.dataSourceId) {
          return page.id === PROJECT_ID;
        }
        if (dataSourceId === NOTION_DATABASES.tasks.dataSourceId) {
          return page.id.startsWith('task-');
        }
        if (dataSourceId === ACTIONS_DS) {
          return page.id.startsWith('act-');
        }
        return false;
      });
      const filtered = options?.filter
        ? all.filter((page) => matchFilter(page, options.filter))
        : all;
      return { ok: true, pages: filtered as NotionRawPage[] };
    },
    async createPage(input) {
      client.createCount += 1;
      seq += 1;
      const id =
        input.dataSourceId === NOTION_DATABASES.tasks.dataSourceId ? `task-${seq}` : `act-${seq}`;
      const page = { id, properties: normalizeProps(input.properties) };
      pages.set(id, page);
      return { ok: true, page };
    },
    async updatePage(pageId, properties) {
      const existing = pages.get(pageId);
      if (!existing) return { ok: false, message: 'missing' };
      const next = {
        id: pageId,
        properties: { ...existing.properties, ...normalizeProps(properties) },
      };
      pages.set(pageId, next);
      return { ok: true, page: next };
    },
    async retrievePage(pageId) {
      const page = pages.get(pageId);
      if (!page) return { ok: false, message: 'missing' };
      return { ok: true, page };
    },
    async appendBlockChildren(blockId, children) {
      const list = blocks.get(blockId);
      if (!list) return { ok: false, message: 'Bandeja no accesible.' };
      list.push(...children);
      return { ok: true };
    },
  };
  return client;
}

function createFakeSheets(): SheetsValuesClient & {
  sessions: string[][];
  sets: string[][];
  putRanges: string[];
} {
  const sessions: string[][] = [[...GYM_SESSIONS_HEADERS]];
  const sets: string[][] = [[...GYM_SETS_HEADERS]];
  const putRanges: string[] = [];
  return {
    sessions,
    sets,
    putRanges,
    async getValues(rangeA1) {
      if (rangeA1.startsWith('Gym Sessions')) {
        return { ok: true, values: sessions.map((row) => [...row]) };
      }
      return { ok: true, values: sets.map((row) => [...row]) };
    },
    async putValues(rangeA1, values) {
      putRanges.push(rangeA1);
      const sheet = rangeA1.startsWith('Gym Sessions') ? sessions : sets;
      const match = /!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(rangeA1);
      if (!match) return { ok: false, message: 'range' };
      const rowNumber = Number(match[2]);
      const startCol = match[1].charCodeAt(0) - 'A'.charCodeAt(0);
      while (sheet.length < rowNumber) sheet.push([]);
      const row = sheet[rowNumber - 1] ?? [];
      const incoming = values[0] ?? [];
      for (let i = 0; i < incoming.length; i += 1) {
        row[startCol + i] = incoming[i] == null ? '' : String(incoming[i]);
      }
      sheet[rowNumber - 1] = row;
      return { ok: true };
    },
  };
}

function previewEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    WRITE_ACTIONS_ENABLED: 'true',
    NOTION_DATA_SOURCE: 'notion',
    NOTION_API_TOKEN: 'secret_test_token',
    NOTION_TASKS_DATA_SOURCE_ID: NOTION_DATABASES.tasks.dataSourceId,
    NOTION_PROJECTS_DATA_SOURCE_ID: NOTION_DATABASES.projects.dataSourceId,
    NOTION_AREAS_DATA_SOURCE_ID: NOTION_DATABASES.areas.dataSourceId,
    NOTION_INBOX_PAGE_ID: INBOX_PAGE,
    NOTION_ACTIONS_DATA_SOURCE_ID: ACTIONS_DS,
    SHEETS_GYM_SESSIONS_RANGE: 'Gym Sessions!A:L',
    SHEETS_GYM_SETS_RANGE: 'Gym Sets!A:J',
    ...extra,
  };
}

function request(
  partial: Pick<ActionRequest, 'actionType' | 'payload' | 'idempotencyKey'> & {
    expectedPrevious?: string | null;
    actorEmail?: string;
  },
): ActionRequest {
  return {
    actionType: partial.actionType,
    actorEmail: partial.actorEmail ?? 'work@example.com',
    payload: partial.payload,
    idempotencyKey: partial.idempotencyKey,
    confirmation: explicit,
    expectedPrevious: partial.expectedPrevious ?? null,
    context: { source: 'web', targetDate: null },
  };
}

test('8E1r-01. flag apagada no construye clientes reales', () => {
  const runtime = buildWriteRuntime({ WRITE_ACTIONS_ENABLED: 'false', NODE_ENV: 'production' });
  assert.equal(runtime.mode, 'closed');
  assert.equal(isWriteActionsEnabled({ WRITE_ACTIONS_ENABLED: 'false' }), false);
});

test('8E1r-02. configuración incompleta falla cerrada', async () => {
  const fake = createFakeNotionClient();
  const runtime = buildWriteRuntime(
    {
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      WRITE_ACTIONS_ENABLED: 'true',
      NOTION_DATA_SOURCE: 'notion',
      NOTION_API_TOKEN: 'secret_x',
    },
    { notionClient: fake },
  );
  assert.equal(runtime.mode, 'real');
  const inbox = await runtime.handlers.inbox.appendCapture(
    {
      text: 'hola',
      link: null,
      capturedAt: '2026-07-22T12:00:00.000Z',
      origin: 'web',
    },
    { idempotencyKey: 'inc' },
  );
  assert.equal(inbox.ok, false);
  if (!inbox.ok) {
    assert.equal(inbox.preserveText, true);
    assert.equal(inbox.code, 'not-configured');
  }
  const status = getWriteRuntimeStatus({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    WRITE_ACTIONS_ENABLED: 'true',
    NOTION_DATA_SOURCE: 'notion',
    NOTION_API_TOKEN: 'secret_x',
  });
  assert.equal(status.inbox, 'misconfigured');
  assert.ok(status.issues.includes('inbox-page-missing'));
  assert.equal(JSON.stringify(status).includes('secret_'), false);
});

test('8E1r-03. configuración completa selecciona puertos reales', () => {
  const fake = createFakeNotionClient();
  const runtime = buildWriteRuntime(previewEnv(), { notionClient: fake });
  assert.equal(runtime.mode, 'real');
  assert.equal(runtime.status.idempotency, 'persistent');
  assert.equal(runtime.status.tasks, 'ready');
});

test('8E1r-04. Preview no usa memoria aunque WRITE_ACTIONS_USE_MEMORY=true', () => {
  assert.equal(
    allowMemoryWritePorts({
      WRITE_ACTIONS_USE_MEMORY: 'true',
      VERCEL_ENV: 'preview',
      NODE_ENV: 'production',
    }),
    false,
  );
  const runtime = buildWriteRuntime(previewEnv({ WRITE_ACTIONS_USE_MEMORY: 'true' }), {
    notionClient: createFakeNotionClient(),
  });
  assert.equal(runtime.mode, 'real');
  assert.notEqual(runtime.status.idempotency, 'memory-test');
});

test('8E1r-05. Notion mock bloquea escrituras reales de tareas', async () => {
  const runtime = buildWriteRuntime(previewEnv({ NOTION_DATA_SOURCE: 'mock' }), {
    notionClient: createFakeNotionClient(),
  });
  const created = await runtime.handlers.tasks.createTask(
    {
      title: 'No',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'mock-block' },
  );
  assert.equal(created.ok, false);
  if (!created.ok) {
    assert.match(created.message, /NOTION_DATA_SOURCE|notion/i);
  }
});

test('8E1r-06. tarea creada y verificada', async () => {
  const fake = createFakeNotionClient();
  const tasks = createNotionTaskWritePort({
    client: fake,
    tasksDataSourceId: NOTION_DATABASES.tasks.dataSourceId,
    projectsDataSourceId: NOTION_DATABASES.projects.dataSourceId,
    areasDataSourceId: NOTION_DATABASES.areas.dataSourceId,
  });
  const created = await tasks.createTask(
    {
      title: 'Correr',
      priority: 'Alta',
      areaKey: 'area.salud',
      projectKey: null,
      date: '2026-07-22',
      duration: '30 min',
      energy: 'Media',
      note: null,
    },
    { idempotencyKey: 't1' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.match(created.key, /^task-/);
  assert.equal(created.key.includes('uuid'), false);
  const snap = await tasks.getTask(created.key);
  assert.ok(snap);
  assert.equal(snap?.title, 'Correr');
  assert.equal(snap?.status, 'Pendiente');
  // Estado canónico es select (no status); el payload escrito debe usar select.
  const raw = [...fake.pages.values()].find((page) => page.id.startsWith('task-'));
  const estado = raw?.properties[TASK_PROPS.status] as {
    select?: { name?: string };
    status?: unknown;
  };
  assert.equal(estado?.select?.name, 'Pendiente');
  assert.equal(estado?.status, undefined);
});

test('8E1r-07. idempotencia evita duplicar tarea entre dos instancias', async () => {
  const shared = createFakeNotionClient();
  const storeA = createNotionIdempotencyStore({
    client: shared,
    actionsDataSourceId: ACTIONS_DS,
  });
  const storeB = createNotionIdempotencyStore({
    client: shared,
    actionsDataSourceId: ACTIONS_DS,
  });
  const result: ActionResult = {
    ok: true,
    code: 'applied',
    message: 'ok',
    idempotencyKey: 'dup-1',
    actionType: 'task.create',
    target: { type: 'task', key: 'task-1' },
    summary: 'ok',
    verified: true,
  };
  await storeA.set('a@ex.com', 'task.create', 'dup-1', result);
  const replay = await storeB.get('a@ex.com', 'task.create', 'dup-1');
  assert.ok(replay);
  assert.equal(replay?.code, 'applied');
  const before = shared.createCount;
  await storeB.set('a@ex.com', 'task.create', 'dup-1', result);
  assert.equal(shared.createCount, before);
});

test('8E1r-08. cambio de estado con verificación', async () => {
  const fake = createFakeNotionClient();
  const tasks = createNotionTaskWritePort({
    client: fake,
    tasksDataSourceId: NOTION_DATABASES.tasks.dataSourceId,
    projectsDataSourceId: NOTION_DATABASES.projects.dataSourceId,
    areasDataSourceId: NOTION_DATABASES.areas.dataSourceId,
  });
  const created = await tasks.createTask(
    {
      title: 'Estado',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'st1' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const updated = await tasks.updateTaskStatus(created.key, 'Hecha', 'Pendiente');
  assert.equal(updated.ok, true);
  const snap = await tasks.getTask(created.key);
  assert.equal(snap?.status, 'Hecha');
  const raw = [...fake.pages.values()].find((page) => page.id.startsWith('task-'));
  const estado = raw?.properties[TASK_PROPS.status] as {
    select?: { name?: string };
    status?: unknown;
  };
  assert.equal(estado?.select?.name, 'Hecha');
  assert.equal(estado?.status, undefined);
});

test('8E1r-09. conflicto de estado previo', async () => {
  const fake = createFakeNotionClient();
  const tasks = createNotionTaskWritePort({
    client: fake,
    tasksDataSourceId: NOTION_DATABASES.tasks.dataSourceId,
    projectsDataSourceId: NOTION_DATABASES.projects.dataSourceId,
    areasDataSourceId: NOTION_DATABASES.areas.dataSourceId,
  });
  const created = await tasks.createTask(
    {
      title: 'Conflicto',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'cf1' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const conflict = await tasks.updateTaskStatus(created.key, 'Hecha', 'En progreso');
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, 'conflict');
});

test('8E1r-10. compatibilidad Área–Proyecto real', async () => {
  const fake = createFakeNotionClient();
  const tasks = createNotionTaskWritePort({
    client: fake,
    tasksDataSourceId: NOTION_DATABASES.tasks.dataSourceId,
    projectsDataSourceId: NOTION_DATABASES.projects.dataSourceId,
    areasDataSourceId: NOTION_DATABASES.areas.dataSourceId,
  });
  const ok = await tasks.resolveAreaProjectCompatibility(
    'area.salud',
    opaqueKey('proj', PROJECT_ID),
  );
  assert.equal(ok.ok, true);
  const bad = await tasks.resolveAreaProjectCompatibility(
    'area.facultad',
    opaqueKey('proj', PROJECT_ID),
  );
  assert.equal(bad.ok, false);
});

test('8E1r-11. Bandeja agrega una sola captura', async () => {
  const fake = createFakeNotionClient();
  const inbox = createNotionInboxWritePort({ client: fake, inboxPageId: INBOX_PAGE });
  const result = await inbox.appendCapture(
    {
      text: 'Comprar agua',
      link: 'https://example.com',
      capturedAt: '2026-07-22T12:00:00.000Z',
      origin: 'web',
    },
    { idempotencyKey: 'in1' },
  );
  assert.equal(result.ok, true);
  assert.equal(fake.blocks.get(INBOX_PAGE)?.length, 1);
});

test('8E1r-12. error de Bandeja preserva texto', async () => {
  const fake = createFakeNotionClient();
  const inbox = createNotionInboxWritePort({
    client: fake,
    inboxPageId: 'missing-page',
  });
  const text = 'Texto a preservar';
  const result = await inbox.appendCapture(
    {
      text,
      link: null,
      capturedAt: '2026-07-22T12:00:00.000Z',
      origin: 'web',
    },
    { idempotencyKey: 'in2' },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.preserveText, true);
  }
});

test('8E1r-13. propuesta se persiste', async () => {
  const fake = createFakeNotionClient();
  const repo = createNotionProposalRepository({
    client: fake,
    actionsDataSourceId: ACTIONS_DS,
  });
  const created = await repo.create(
    {
      name: 'Bloque calendar',
      proposedActionType: 'calendar.block.propose',
      targetType: 'calendar-block',
      targetKey: null,
      reason: 'Enfocar',
      expectedChange: '60m',
      risk: 'medium',
      reversible: true,
      sanitizedPayload: { title: 'Deep work' },
    },
    { key: 'prop-1', idempotencyKey: 'p1', createdAt: '2026-07-22' },
  );
  assert.equal(created.key, 'prop-1');
  assert.equal(created.status, 'pending');
  const got = await repo.get('prop-1');
  assert.equal(got?.name, 'Bloque calendar');
});

test('8E1r-14. approvals board lista desde repositorio persistente', async () => {
  const fake = createFakeNotionClient();
  const repo = createNotionProposalRepository({
    client: fake,
    actionsDataSourceId: ACTIONS_DS,
  });
  await repo.create(
    {
      name: 'A',
      proposedActionType: 'task.create',
      targetType: 'task',
      targetKey: null,
      reason: 'r',
      expectedChange: 'e',
      risk: 'low',
      reversible: true,
      sanitizedPayload: {},
    },
    { key: 'prop-a', idempotencyKey: 'pa', createdAt: '2026-07-22' },
  );
  const list = await repo.list('pending');
  assert.equal(list.length, 1);
  assert.equal(list[0]?.key, 'prop-a');
});

test('8E1r-15. approve/reject actualiza Notion', async () => {
  const fake = createFakeNotionClient();
  const repo = createNotionProposalRepository({
    client: fake,
    actionsDataSourceId: ACTIONS_DS,
  });
  await repo.create(
    {
      name: 'Decidir',
      proposedActionType: 'task.create',
      targetType: 'task',
      targetKey: null,
      reason: 'r',
      expectedChange: 'e',
      risk: 'low',
      reversible: true,
      sanitizedPayload: {},
    },
    { key: 'prop-d', idempotencyKey: 'pd', createdAt: '2026-07-22' },
  );
  const approved = await repo.updateStatus('prop-d', 'approved', {
    decidedAt: '2026-07-22',
  });
  assert.equal(approved?.status, 'approved');
  const rejected = await repo.updateStatus('prop-d', 'rejected', {
    decidedAt: '2026-07-22',
  });
  assert.equal(rejected?.status, 'rejected');
});

test('8E1r-16. auditoría se persiste', async () => {
  const fake = createFakeNotionClient();
  const audit = createNotionAuditSink({ client: fake, actionsDataSourceId: ACTIONS_DS });
  const appended = await audit.append({
    actionType: 'task.create',
    actorHint: 'wo***@example.com',
    at: '2026-07-22T12:00:00.000Z',
    resultCode: 'applied',
    confirmationMode: 'explicit',
    idempotencyKey: 'aud-k',
    errorCode: null,
    targetKey: 'task-1',
    verified: true,
  });
  assert.equal(appended.ok, true);
  const rows = await audit.list();
  assert.equal(rows.length, 1);
});

test('8E1r-17. auditoría no contiene secretos', async () => {
  const fake = createFakeNotionClient();
  const audit = createNotionAuditSink({ client: fake, actionsDataSourceId: ACTIONS_DS });
  await audit.append({
    actionType: 'task.create',
    actorHint: 'wo***@example.com',
    at: '2026-07-22T12:00:00.000Z',
    resultCode: 'applied',
    confirmationMode: 'explicit',
    idempotencyKey: 'aud-safe',
    errorCode: null,
    targetKey: 'task-1',
    verified: true,
  });
  const rows = await audit.list();
  assert.equal(auditLooksSafe(rows[0]!), true);
  assert.equal(JSON.stringify(rows).includes('secret_'), false);
  assert.equal(JSON.stringify(rows).includes('notion.so'), false);
});

test('8E1r-18. idempotencia persistente devuelve replay', async () => {
  const fake = createFakeNotionClient();
  const idem = createNotionIdempotencyStore({
    client: fake,
    actionsDataSourceId: ACTIONS_DS,
  });
  const audit = createMemoryAuditSink();
  const tasks = createNotionTaskWritePort({
    client: fake,
    tasksDataSourceId: NOTION_DATABASES.tasks.dataSourceId,
    projectsDataSourceId: NOTION_DATABASES.projects.dataSourceId,
    areasDataSourceId: NOTION_DATABASES.areas.dataSourceId,
  });
  const first = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'replay-1',
      payload: {
        title: 'Una',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    {
      writesEnabled: true,
      idempotency: idem,
      audit,
      handlers: {
        tasks,
        inbox: createNotionInboxWritePort({ client: fake, inboxPageId: INBOX_PAGE }),
        gym: createGymSheetWritePort({
          sessionsRange: 'Gym Sessions!A:L',
          setsRange: 'Gym Sets!A:J',
          sheets: createFakeSheets(),
        }),
        proposals: createNotionProposalRepository({
          client: fake,
          actionsDataSourceId: ACTIONS_DS,
        }),
      },
    },
  );
  assert.equal(first.ok, true);
  const second = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'replay-1',
      payload: {
        title: 'Una',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    {
      writesEnabled: true,
      idempotency: idem,
      audit,
      handlers: {
        tasks,
        inbox: createNotionInboxWritePort({ client: fake, inboxPageId: INBOX_PAGE }),
        gym: createGymSheetWritePort({
          sessionsRange: 'Gym Sessions!A:L',
          setsRange: 'Gym Sets!A:J',
          sheets: createFakeSheets(),
        }),
        proposals: createNotionProposalRepository({
          client: fake,
          actionsDataSourceId: ACTIONS_DS,
        }),
      },
    },
  );
  assert.equal(second.code, 'idempotent-replay');
});

test('8E1r-19. headers Gym Sessions válidos', () => {
  assert.deepEqual(
    [...GYM_SESSIONS_HEADERS],
    [
      'sessionId',
      'date',
      'routineKey',
      'workoutDayKey',
      'startedAt',
      'finishedAt',
      'durationMinutes',
      'energyBefore',
      'notes',
      'status',
      'idempotencyKey',
      'createdAt',
    ],
  );
});

test('8E1r-20. headers Gym Sets válidos', () => {
  assert.deepEqual(
    [...GYM_SETS_HEADERS],
    [
      'sessionId',
      'exerciseKey',
      'exerciseName',
      'setIndex',
      'weight',
      'reps',
      'rir',
      'rpe',
      'completed',
      'notes',
    ],
  );
});

test('8E1r-21. headers incorrectos bloquean escritura', async () => {
  const sheets = createFakeSheets();
  sheets.sessions[0] = ['wrong', 'headers'];
  const gym = createGymSheetWritePort({
    sessionsRange: 'Gym Sessions!A:L',
    setsRange: 'Gym Sets!A:J',
    sheets,
  });
  const result = await gym.createPendingSession(
    {
      date: '2026-07-22',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      energyBefore: null,
      notes: null,
      sets: [],
    },
    { sessionId: 's1', idempotencyKey: 'g1', createdAt: '2026-07-22' },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /Esquema/);
});

test('8E1r-22. sesión pending', async () => {
  const sheets = createFakeSheets();
  const gym = createGymSheetWritePort({
    sessionsRange: 'Gym Sessions!A:L',
    setsRange: 'Gym Sets!A:J',
    sheets,
  });
  const result = await gym.createPendingSession(
    {
      date: '2026-07-22',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      energyBefore: null,
      notes: null,
      sets: [],
    },
    { sessionId: 'gym-s1', idempotencyKey: 'g-pending', createdAt: '2026-07-22' },
  );
  assert.equal(result.ok, true);
  assert.equal(sheets.sessions[1]?.[9], 'pending');
});

test('8E1r-23. sets escritos', async () => {
  const sheets = createFakeSheets();
  const gym = createGymSheetWritePort({
    sessionsRange: 'Gym Sessions!A:L',
    setsRange: 'Gym Sets!A:J',
    sheets,
  });
  await gym.createPendingSession(
    {
      date: '2026-07-22',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      energyBefore: null,
      notes: null,
      sets: [],
    },
    { sessionId: 'gym-s2', idempotencyKey: 'g-sets', createdAt: '2026-07-22' },
  );
  const written = await gym.writeSets('gym-s2', [
    {
      exerciseKey: 'ex1',
      exerciseName: 'Press',
      setIndex: 1,
      weight: 40,
      reps: 8,
      rir: 2,
      rpe: null,
      completed: true,
      notes: null,
    },
  ]);
  assert.equal(written.ok, true);
  if (written.ok) assert.equal(written.written, 1);
  assert.equal(sheets.sets[1]?.[0], 'gym-s2');
});

test('8E1r-24. sesión complete', async () => {
  const sheets = createFakeSheets();
  const gym = createGymSheetWritePort({
    sessionsRange: 'Gym Sessions!A:L',
    setsRange: 'Gym Sets!A:J',
    sheets,
  });
  await gym.createPendingSession(
    {
      date: '2026-07-22',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      energyBefore: null,
      notes: null,
      sets: [],
    },
    { sessionId: 'gym-s3', idempotencyKey: 'g-complete', createdAt: '2026-07-22' },
  );
  await gym.writeSets('gym-s3', [
    {
      exerciseKey: 'ex1',
      exerciseName: 'Press',
      setIndex: 1,
      weight: 40,
      reps: 8,
      rir: null,
      rpe: null,
      completed: true,
      notes: null,
    },
  ]);
  const verified = await gym.verifySession('gym-s3', 1);
  assert.equal(verified.ok, true);
  const status = await gym.setSessionStatus('gym-s3', 'complete');
  assert.equal(status.ok, true);
  assert.equal(sheets.sessions[1]?.[9], 'complete');
});

test('8E1r-25. fallo parcial deja partial/failed', async () => {
  const sheets = createFakeSheets();
  const originalPut = sheets.putValues.bind(sheets);
  let setPuts = 0;
  sheets.putValues = async (range, values) => {
    if (range.startsWith('Gym Sets')) {
      setPuts += 1;
      if (setPuts > 1) return { ok: false, message: 'fail' };
    }
    return originalPut(range, values);
  };
  const gym = createGymSheetWritePort({
    sessionsRange: 'Gym Sessions!A:L',
    setsRange: 'Gym Sets!A:J',
    sheets,
  });
  await gym.createPendingSession(
    {
      date: '2026-07-22',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      energyBefore: null,
      notes: null,
      sets: [],
    },
    { sessionId: 'gym-partial', idempotencyKey: 'g-partial', createdAt: '2026-07-22' },
  );
  const written = await gym.writeSets('gym-partial', [
    {
      exerciseKey: 'ex1',
      exerciseName: 'A',
      setIndex: 1,
      weight: 10,
      reps: 5,
      rir: null,
      rpe: null,
      completed: true,
      notes: null,
    },
    {
      exerciseKey: 'ex1',
      exerciseName: 'A',
      setIndex: 2,
      weight: 10,
      reps: 5,
      rir: null,
      rpe: null,
      completed: true,
      notes: null,
    },
  ]);
  assert.equal(written.ok, false);
  if (!written.ok) assert.equal(written.written, 1);
  await gym.setSessionStatus('gym-partial', 'partial');
  assert.equal(sheets.sessions[1]?.[9], 'partial');
});

test('8E1r-26. ningún valor ausente se convierte en cero', () => {
  const row = gymSetRowCells('s', {
    exerciseKey: 'ex',
    exerciseName: 'N',
    setIndex: 1,
    weight: null,
    reps: null,
    rir: null,
    rpe: null,
    completed: false,
    notes: null,
  });
  assert.equal(row[4], '');
  assert.equal(row[5], '');
  assert.equal(row.includes('0'), false);
});

test('8E1r-27. no se escriben otras filas', async () => {
  const sheets = createFakeSheets();
  sheets.sessions.push([
    'other-session',
    '2026-07-01',
    'r',
    'd',
    '',
    '',
    '',
    '',
    '',
    'complete',
    'old',
    '2026-07-01',
  ]);
  const gym = createGymSheetWritePort({
    sessionsRange: 'Gym Sessions!A:L',
    setsRange: 'Gym Sets!A:J',
    sheets,
  });
  await gym.createPendingSession(
    {
      date: '2026-07-22',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      energyBefore: null,
      notes: null,
      sets: [],
    },
    { sessionId: 'gym-new', idempotencyKey: 'g-new', createdAt: '2026-07-22' },
  );
  assert.equal(sheets.sessions[1]?.[0], 'other-session');
  assert.equal(sheets.sessions[2]?.[0], 'gym-new');
});

test('8E1r-28. cliente no recibe UUIDs ni URLs internas', async () => {
  const fake = createFakeNotionClient();
  const tasks = createNotionTaskWritePort({
    client: fake,
    tasksDataSourceId: NOTION_DATABASES.tasks.dataSourceId,
    projectsDataSourceId: NOTION_DATABASES.projects.dataSourceId,
    areasDataSourceId: NOTION_DATABASES.areas.dataSourceId,
  });
  const created = await tasks.createTask(
    {
      title: 'Limpio',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'clean' },
  );
  const json = JSON.stringify(created);
  assert.equal(json.includes('https://'), false);
  assert.equal(json.includes('notion.so'), false);
  assert.equal(json.includes(AREA_ID), false);
});

test('8E1r-29. Journaling sigue prohibido', () => {
  assert.equal(isForbiddenActionType('journaling.read'), true);
  assert.equal(isForbiddenActionType('journaling.write'), true);
});

test('8E1r-30. no existen métodos destructivos', () => {
  const fake = createFakeNotionClient();
  const tasks = createNotionTaskWritePort({
    client: fake,
    tasksDataSourceId: NOTION_DATABASES.tasks.dataSourceId,
    projectsDataSourceId: NOTION_DATABASES.projects.dataSourceId,
    areasDataSourceId: NOTION_DATABASES.areas.dataSourceId,
  });
  assert.equal(portHasDestructiveMethods(tasks), false);
  const portsSource = readFileSync(path.join(process.cwd(), 'lib/actions/ports.ts'), 'utf8');
  assert.equal(/deleteTask|archivePage|mergePages/.test(portsSource), false);
  const gymSource = readFileSync(path.join(process.cwd(), 'lib/actions/gym-sheets.ts'), 'utf8');
  assert.equal(/values\.append|values:append/.test(gymSource), false);
});

test('8E1r-31. status sanitizado no filtra secretos', () => {
  const status = getWriteRuntimeStatus(previewEnv());
  const json = JSON.stringify(status);
  assert.equal(json.includes('secret_'), false);
  assert.equal(json.includes(ACTIONS_DS), false);
  assert.equal(json.includes(INBOX_PAGE), false);
  assert.equal(status.writesEnabled, true);
});

test('8E1r-32. memoria de proceso sigue disponible para tests unitarios', async () => {
  const store = createMemoryIdempotencyStore();
  await store.set('a@b.c', 'task.create', 'k', {
    ok: true,
    code: 'applied',
    message: 'ok',
    idempotencyKey: 'k',
    actionType: 'task.create',
    target: null,
    summary: null,
    verified: true,
  });
  const got = await store.get('a@b.c', 'task.create', 'k');
  assert.equal(got?.code, 'applied');
});
