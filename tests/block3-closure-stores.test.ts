/**
 * Block 3 technical closure — durable stores, CAS, ownership, codec, runtime.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import {
  createCalendarHoldWritePort,
  createFakeCalendarHoldApiClient,
  deriveCalendarProviderEventId,
  toBase32Hex,
} from '@/lib/actions/calendar-hold';
import {
  createMemoryEncryptedPayloadStore,
  createUpstashEncryptedPayloadStore,
  encryptProposalPayload,
  type EncryptedProposalEnvelope,
} from '@/lib/actions/encryption';
import { createMemoryWriteCoordination } from '@/lib/actions/coordination';
import {
  decodePayloadBag,
  encodePayloadBag,
  LEDGER_BAG_MAX_TOTAL_CHARS,
} from '@/lib/actions/ledger-bag-codec';
import { createMemoryInboxCaptureMappingStore } from '@/lib/actions/inbox-mapping';
import { createNotionInboxWritePort } from '@/lib/actions/notion-inbox';
import { readSelectName, type NotionActionsClient } from '@/lib/actions/notion-client';
import { createNotionTaskWritePort } from '@/lib/actions/notion-tasks';
import {
  createMemoryProposalPort,
  createMemoryTaskPort,
  createMemoryInboxPort,
  createMemoryGymPort,
} from '@/lib/actions/memory-ports';
import { compensateBusiness, handleAllowedAction } from '@/lib/actions/handlers';
import { buildWriteRuntime } from '@/lib/actions/runtime';
import { isAllowedProposalStatusTransition } from '@/lib/actions/proposal-transitions';
import type { UpstashRestConfig } from '@/lib/actions/upstash-rest';
import type { ActionDiff } from '@/types/actions';

function fakeUpstashFetch(store: Map<string, { value: string; expiresAt: number }>): typeof fetch {
  return async (_url, init) => {
    const body = typeof init?.body === 'string' ? init.body : '[]';
    const command = JSON.parse(body) as unknown[];
    const op = String(command[0] ?? '').toUpperCase();
    const now = Date.now();
    if (op === 'SET') {
      const key = String(command[1]);
      const value = String(command[2]);
      let ttl = 60;
      const exIdx = command.findIndex((part) => String(part).toUpperCase() === 'EX');
      if (exIdx >= 0) ttl = Number(command[exIdx + 1]) || 60;
      store.set(key, { value, expiresAt: now + ttl * 1000 });
      return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
    }
    if (op === 'GET') {
      const key = String(command[1]);
      const row = store.get(key);
      if (!row || row.expiresAt < now) {
        store.delete(key);
        return new Response(JSON.stringify({ result: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: row.value }), { status: 200 });
    }
    if (op === 'DEL') {
      const key = String(command[1]);
      store.delete(key);
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'unsupported' }), { status: 500 });
  };
}

test('closure-01. Upstash payload store put/get/delete via fake fetch', async () => {
  const redis = new Map<string, { value: string; expiresAt: number }>();
  const config: UpstashRestConfig = {
    url: 'https://example.upstash.io',
    token: 'test-token-16chars',
    namespace: 'vida2:writes:test:vida2-writes-v1',
    timeoutMs: 3000,
  };
  const store = createUpstashEncryptedPayloadStore(config, fakeUpstashFetch(redis));
  const key = randomBytes(32);
  const envelope = encryptProposalPayload(key, JSON.stringify({ hello: 'world' }));
  await store.put('enc-key-1', envelope, 60);
  const got = await store.get('enc-key-1');
  assert.ok(got);
  assert.equal(got.v, 1);
  assert.equal(got.ciphertext, envelope.ciphertext);
  await store.delete('enc-key-1');
  assert.equal(await store.get('enc-key-1'), null);
  // No plaintext in redis values
  for (const row of redis.values()) {
    assert.equal(row.value.includes('hello'), false);
  }
});

test('closure-02. Calendar multi-instance shares fake client + deterministic IDs', async () => {
  const hmacKey = createHash('sha256').update('test-hmac').digest();
  const shared = createFakeCalendarHoldApiClient();
  const portA = createCalendarHoldWritePort({
    calendarId: 'write-cal',
    timezone: 'America/Argentina/Cordoba',
    client: shared,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
  });
  const portB = createCalendarHoldWritePort({
    calendarId: 'write-cal',
    timezone: 'America/Argentina/Cordoba',
    client: shared,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
  });
  const start = '2030-01-01T10:00:00-03:00';
  const end = '2030-01-01T11:00:00-03:00';
  const created = await portA.createHold(
    { title: 'Hold A', start, end, note: null, relatedTaskKey: null },
    {
      idempotencyKey: 'idem-hold-1',
      ownership: 'own-abc',
      payloadDigest: 'digest-1',
      contractVersion: 'vida2-writes-v1',
    },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const fromB = await portB.getHold(created.key);
  assert.ok(fromB);
  assert.equal(fromB.title, 'Hold A');
  const deleted = await portB.deleteHoldWithOwnership(created.key, 'own-abc');
  assert.equal(deleted.ok, true);
  assert.equal(await portA.getHold(created.key), null);
  const providerId = deriveCalendarProviderEventId({
    calendarId: 'write-cal',
    contractVersion: 'vida2-writes-v1',
    clientKey: created.key,
    hmacKey,
  });
  assert.match(providerId, /^[0-9a-v]+$/);
  assert.ok(providerId.length >= 5 && providerId.length <= 1024);
  assert.equal(toBase32Hex(Buffer.from([0xff])).length > 0, true);
});

test('closure-03. Notion ownership exact equality; false 24-char proof fails', async () => {
  const pages = new Map<
    string,
    { id: string; properties: Record<string, unknown>; archived?: boolean }
  >();
  const client: NotionActionsClient = {
    async queryDataSource(dataSourceId) {
      if (dataSourceId === 'areas') {
        return {
          ok: true,
          pages: [
            {
              id: 'area-1',
              properties: {
                Name: { title: [{ plain_text: 'Salud' }] },
              },
            },
          ],
        };
      }
      if (dataSourceId === 'projects') {
        return { ok: true, pages: [] };
      }
      return {
        ok: true,
        pages: [...pages.values()]
          .filter((page) => !page.archived)
          .map((page) => ({
            id: page.id,
            properties: page.properties,
          })),
      };
    },
    async createPage(input) {
      const id = `task-${pages.size + 1}`;
      const page = { id, properties: { ...input.properties } };
      // Normalize rich_text/title for readers
      for (const [k, v] of Object.entries(page.properties)) {
        const obj = v as Record<string, unknown>;
        if (Array.isArray(obj.rich_text)) {
          page.properties[k] = {
            rich_text: (obj.rich_text as { text?: { content?: string } }[]).map((part) => ({
              plain_text: part.text?.content ?? '',
              text: { content: part.text?.content ?? '' },
            })),
          };
        }
        if (Array.isArray(obj.title)) {
          page.properties[k] = {
            title: (obj.title as { text?: { content?: string } }[]).map((part) => ({
              plain_text: part.text?.content ?? '',
              text: { content: part.text?.content ?? '' },
            })),
          };
        }
        if (obj.select && typeof obj.select === 'object') {
          page.properties[k] = { select: obj.select };
        }
        if (obj.relation) page.properties[k] = { relation: obj.relation };
      }
      pages.set(id, page);
      return { ok: true, page };
    },
    async updatePage(pageId, properties) {
      const page = pages.get(pageId);
      if (!page) return { ok: false, message: 'missing' };
      for (const [k, v] of Object.entries(properties)) {
        const obj = v as Record<string, unknown>;
        if (Array.isArray(obj.rich_text)) {
          page.properties[k] = {
            rich_text: (obj.rich_text as { text?: { content?: string } }[]).map((part) => ({
              plain_text: part.text?.content ?? '',
              text: { content: part.text?.content ?? '' },
            })),
          };
        } else {
          page.properties[k] = v;
        }
      }
      return { ok: true, page };
    },
    async retrievePage(pageId) {
      const page = pages.get(pageId);
      return page ? { ok: true, page } : { ok: false, message: 'missing' };
    },
    async archivePage(pageId) {
      const page = pages.get(pageId);
      if (!page) return { ok: false, message: 'missing' };
      page.archived = true;
      return { ok: true, archived: true };
    },
    async appendBlockChildren() {
      return { ok: true, blockIds: [] };
    },
    async retrieveBlock() {
      return { ok: false, message: 'n/a' };
    },
    async archiveBlock() {
      return { ok: false, message: 'n/a' };
    },
  };

  // AdaptArea needs more properties — use memory tasks path for ownership unit via fake property store
  const ownershipProp = 'Vida2 Ownership';
  const storedOwn = 'abcdabcdabcdabcdabcdabcd';
  const pageId = 'page-own-1';
  pages.set(pageId, {
    id: pageId,
    properties: {
      Name: { title: [{ plain_text: 'T', text: { content: 'T' } }] },
      Status: { select: { name: 'Pendiente' } },
      [ownershipProp]: {
        rich_text: [{ plain_text: storedOwn, text: { content: storedOwn } }],
      },
    },
  });

  // Direct archive path: build a minimal port and monkey via archiveOwnedTask only
  const port = createNotionTaskWritePort({
    client,
    tasksDataSourceId: 'tasks',
    projectsDataSourceId: 'projects',
    areasDataSourceId: 'areas',
    ownershipProperty: ownershipProp,
  });

  // Fake opaque key match: opaqueKey('task', pageId)
  const { opaqueKey } = await import('@/lib/actions/opaque');
  const taskKey = opaqueKey('task', pageId);

  const falseProof = 'zzzzzzzzzzzzzzzzzzzzzzzz'; // 24 chars, wrong
  assert.equal(falseProof.length, 24);
  const denied = await port.archiveOwnedTask(taskKey, falseProof);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, 'ownership-mismatch');

  const ok = await port.archiveOwnedTask(taskKey, storedOwn);
  assert.equal(ok.ok, true);

  // Postcondición real: la PAGE quedó archivada (papelera), no en "Algún día".
  assert.equal(pages.get(pageId)?.archived, true);
  assert.equal(readSelectName(pages.get(pageId)?.properties.Status), 'Pendiente');
  assert.notEqual(readSelectName(pages.get(pageId)?.properties.Status), 'Algún día');
  assert.equal(await port.getTask(taskKey), null);

  // Ownership incorrecto nunca archiva.
  const other = 'ffffffffffffffffffffffff';
  pages.set('page-own-2', {
    id: 'page-own-2',
    properties: {
      Name: { title: [{ plain_text: 'T2', text: { content: 'T2' } }] },
      Status: { select: { name: 'Pendiente' } },
      [ownershipProp]: { rich_text: [{ plain_text: other, text: { content: other } }] },
    },
  });
  const denied2 = await port.archiveOwnedTask(
    opaqueKey('task', 'page-own-2'),
    'not-the-proof-xxxxxxxxxxx',
  );
  assert.equal(denied2.ok, false);
  assert.equal(pages.get('page-own-2')?.archived, undefined);
});

test('closure-04. Inbox multi-instance mapping store', async () => {
  const blocks = new Map<string, { archived: boolean; text: string }>();
  let seq = 0;
  const mapping = createMemoryInboxCaptureMappingStore();
  function makeClient(): NotionActionsClient {
    return {
      async queryDataSource() {
        return { ok: true, pages: [] };
      },
      async createPage() {
        return { ok: false, message: 'n/a' };
      },
      async updatePage() {
        return { ok: false, message: 'n/a' };
      },
      async retrievePage() {
        return { ok: true, page: { id: 'inbox', properties: {} } };
      },
      async archivePage() {
        return { ok: false, message: 'n/a' };
      },
      async appendBlockChildren(_blockId, children) {
        seq += 1;
        const id = `block-${seq}`;
        const child = children[0] as {
          paragraph?: { rich_text?: { text?: { content?: string } }[] };
        };
        const text = child.paragraph?.rich_text?.[0]?.text?.content ?? '';
        blocks.set(id, { archived: false, text });
        return { ok: true, blockIds: [id] };
      },
      async retrieveBlock(blockId) {
        const row = blocks.get(blockId);
        if (!row) return { ok: false, message: 'missing' };
        return {
          ok: true,
          block: {
            id: blockId,
            archived: row.archived,
            type: 'paragraph',
            plainText: row.text,
          },
        };
      },
      async archiveBlock(blockId) {
        const row = blocks.get(blockId);
        if (!row) return { ok: false, message: 'missing' };
        row.archived = true;
        return { ok: true };
      },
    };
  }

  const portA = createNotionInboxWritePort({
    client: makeClient(),
    inboxPageId: 'inbox',
    mappingStore: mapping,
    mappingTtlSeconds: 3600,
  });
  const portB = createNotionInboxWritePort({
    client: makeClient(),
    inboxPageId: 'inbox',
    mappingStore: mapping,
    mappingTtlSeconds: 3600,
  });

  const appended = await portA.appendCapture(
    {
      text: 'nota',
      capturedAt: '2030-01-01T12:00:00.000Z',
      origin: 'web',
      link: null,
    },
    { idempotencyKey: 'inbox-idem-1' },
  );
  assert.equal(appended.ok, true);
  if (!appended.ok) return;
  const verified = await portB.verifyCapture(appended.key);
  assert.equal(verified.ok && verified.present, true);
  const archived = await portB.archiveCapture(appended.key, appended.ownership);
  assert.equal(archived.ok, true);
  const after = await portA.verifyCapture(appended.key);
  assert.equal(after.ok && after.present, false);
});

test('closure-05. task.change-status rollback via diff CAS', async () => {
  const tasks = createMemoryTaskPort();
  const created = await tasks.createTask(
    {
      title: 'T',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 't1' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await tasks.updateTaskStatus(created.key, 'En progreso', 'Pendiente');
  const diff: ActionDiff = {
    fields: [{ field: 'status', before: 'Pendiente', after: 'En progreso' }],
  };
  const compensated = await compensateBusiness({
    actionType: 'task.change-status',
    targetKey: created.key,
    ownership: null,
    deps: {
      tasks,
      inbox: createMemoryInboxPort(),
      gym: createMemoryGymPort(),
      proposals: createMemoryProposalPort(),
    },
    diff,
  });
  assert.equal(compensated.ok, true);
  const after = await tasks.getTask(created.key);
  assert.equal(after?.status, 'Pendiente');
});

test('closure-06. ledger codec round trip; oversize reject; no truncation', () => {
  const bag = {
    expiresAt: '2030-01-01T00:00:00.000Z',
    encryptedPayloadKey: 'enc-abc',
    beforeDigest: 'status:Pendiente',
    diff: {
      fields: Array.from({ length: 40 }, (_, i) => ({
        field: `f${i}`,
        before: `before-${i}-${'x'.repeat(20)}`,
        after: `after-${i}-${'y'.repeat(20)}`,
      })),
    },
  };
  const encoded = encodePayloadBag(bag);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) return;
  const wire = JSON.stringify(encoded.encoded);
  const decoded = decodePayloadBag(wire);
  assert.equal(decoded.expiresAt, bag.expiresAt);
  assert.equal(decoded.encryptedPayloadKey, bag.encryptedPayloadKey);
  assert.equal(decoded.beforeDigest, bag.beforeDigest);
  assert.ok(decoded.diff);

  const huge = { blob: 'z'.repeat(LEDGER_BAG_MAX_TOTAL_CHARS + 100) };
  const oversize = encodePayloadBag(huge);
  assert.equal(oversize.ok, false);
});

test('closure-07. CAS transitions reject stale / double approval', async () => {
  assert.equal(isAllowedProposalStatusTransition('pending', 'executing'), true);
  assert.equal(isAllowedProposalStatusTransition('pending', 'applied'), false);
  assert.equal(isAllowedProposalStatusTransition('applied', 'rolling-back'), true);
  assert.equal(isAllowedProposalStatusTransition('rejected', 'pending'), false);

  const proposals = createMemoryProposalPort();
  const created = await proposals.create(
    {
      name: 'P',
      proposedActionType: 'task.create',
      targetType: 'task',
      targetKey: null,
      risk: 'low',
      reversible: true,
      reason: 'r',
      expectedChange: 'e',
      payload: {
        title: 'T',
        priority: 'Media',
        areaKey: 'a',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    },
    {
      key: 'prop-cas-1',
      idempotencyKey: 'idem',
      createdAt: '2030-01-01T00:00:00.000Z',
      expiresAt: '2030-01-02T00:00:00.000Z',
      payloadDigest: 'd',
      contractVersion: 'vida2-writes-v1',
      source: 'web',
      beforeDigest: null,
      diff: null,
      encryptedPayloadKey: 'enc',
    },
  );
  const first = await proposals.updateStatus(
    created.key,
    'executing',
    {},
    { expectedStatus: 'pending' },
  );
  assert.ok(first);
  const double = await proposals.updateStatus(
    created.key,
    'executing',
    {},
    { expectedStatus: 'pending' },
  );
  assert.equal(double, null);
  const invalid = await proposals.updateStatus(
    created.key,
    'rolled-back',
    {},
    { expectedStatus: 'executing' },
  );
  assert.equal(invalid, null);
});

test('closure-08. real runtime never uses memory encrypted payload store', () => {
  const env = {
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    WRITE_ACTIONS_ENABLED: 'true',
    WRITE_COORDINATION_MODE: 'upstash',
    WRITE_PROPOSAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token-16chars-xx',
    GOOGLE_CALENDAR_WRITE_ID: 'primary',
    GOOGLE_CALENDAR_CLIENT_ID: 'cid',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'csecret',
    GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh',
    GOOGLE_CALENDAR_IDS: 'primary',
    NOTION_DATA_SOURCE: 'notion',
    NOTION_API_TOKEN: 'secret_test',
    NOTION_TASKS_DATA_SOURCE_ID: 'tasks-ds',
    NOTION_PROJECTS_DATA_SOURCE_ID: 'projects-ds',
    NOTION_AREAS_DATA_SOURCE_ID: 'areas-ds',
    NOTION_INBOX_PAGE_ID: 'inbox',
    NOTION_ACTIONS_DATA_SOURCE_ID: 'actions-ds',
    SHEETS_GYM_SESSIONS_RANGE: 'Gym Sessions!A:L',
    SHEETS_GYM_SETS_RANGE: 'Gym Sets!A:J',
  };
  const runtime = buildWriteRuntime(env);
  assert.equal(runtime.mode, 'real');
  assert.ok(runtime.encryptionStore);
  const memory = createMemoryEncryptedPayloadStore();
  assert.notEqual(runtime.encryptionStore, memory);
  // Upstash store has no size(); memory store does.
  assert.equal(typeof (runtime.encryptionStore as { size?: unknown }).size, 'undefined');
  assert.equal(runtime.status.components.encryptedPayloadStore, 'ready');
});

test('closure-09. invalid envelope rejected by upstash store', async () => {
  const redis = new Map<string, { value: string; expiresAt: number }>();
  const config: UpstashRestConfig = {
    url: 'https://example.upstash.io',
    token: 'test-token-16chars',
    namespace: 'vida2:writes:test:vida2-writes-v1',
    timeoutMs: 3000,
  };
  const store = createUpstashEncryptedPayloadStore(config, fakeUpstashFetch(redis));
  await assert.rejects(async () => {
    await store.put('bad', { v: 2 } as unknown as EncryptedProposalEnvelope, 10);
  });
});

test('closure-10. double approve conflicts via CAS expectedStatus', async () => {
  const encryptionStore = createMemoryEncryptedPayloadStore();
  const encryptionKey = randomBytes(32);
  const proposals = createMemoryProposalPort();
  const tasks = createMemoryTaskPort({ areaProjectMap: { 'proj-x': 'area.salud' } });
  const coordination = createMemoryWriteCoordination();
  const deps = {
    tasks,
    inbox: createMemoryInboxPort(),
    gym: createMemoryGymPort(),
    proposals,
    encryptionStore,
    encryptionKey,
    coordination,
    approvalTtlSeconds: 86400,
    rollbackWindowSeconds: 604800,
    contractVersion: 'vida2-writes-v1',
    now: () => '2030-01-01T00:00:00.000Z',
  };

  const created = await handleAllowedAction({
    actionType: 'proposal.create',
    payload: {
      name: 'Crear',
      proposedActionType: 'task.create',
      targetType: 'task',
      targetKey: null,
      risk: 'medium',
      reversible: true,
      reason: 'r',
      expectedChange: 'e',
      payload: {
        title: 'Nueva',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    },
    expectedPrevious: null,
    idempotencyKey: 'create-1',
    deps,
  });
  assert.equal(created.ok, true);
  const proposalKey = created.target?.key;
  assert.ok(proposalKey);

  const approve1 = await handleAllowedAction({
    actionType: 'proposal.approve',
    payload: { proposalKey },
    expectedPrevious: null,
    idempotencyKey: 'approve-1',
    deps,
  });
  assert.equal(approve1.ok, true);

  const approve2 = await handleAllowedAction({
    actionType: 'proposal.approve',
    payload: { proposalKey },
    expectedPrevious: null,
    idempotencyKey: 'approve-2',
    deps,
  });
  assert.equal(approve2.ok, false);
  assert.equal(approve2.code, 'conflict');
});
