/**
 * Hotfix: loader de /aprobaciones usa listRuntimeProposals (runtime persistente).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { isWriteActionsEnabled } from '@/lib/actions/config';
import type { NotionActionsClient, NotionPageResult } from '@/lib/actions/notion-client';
import { createNotionProposalRepository } from '@/lib/actions/notion-ledger';
import { buildWriteRuntime, listRuntimeProposals } from '@/lib/actions/runtime';
import type { NotionRawPage } from '@/lib/notion/adapters';

const ACTIONS_DS = 'actions-ds-approvals-test';

function createSharedFakeClient(): NotionActionsClient & {
  pages: Map<string, NotionPageResult>;
} {
  const pages = new Map<string, NotionPageResult>();
  let seq = 0;

  function normalizeProps(properties: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!value || typeof value !== 'object') {
        out[key] = value;
        continue;
      }
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.title) || Array.isArray(obj.rich_text)) {
        const kind = Array.isArray(obj.title) ? 'title' : 'rich_text';
        const parts = (obj[kind] as unknown[]) ?? [];
        out[key] = {
          [kind]: parts.map((part) => {
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

  return {
    pages,
    async queryDataSource(dataSourceId) {
      if (dataSourceId !== ACTIONS_DS) return { ok: true, pages: [] };
      return { ok: true, pages: [...pages.values()] as NotionRawPage[] };
    },
    async createPage(input) {
      seq += 1;
      const id = `act-${seq}`;
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
    async appendBlockChildren() {
      return { ok: false, message: 'unused' };
    },
  };
}

function previewEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    WRITE_ACTIONS_ENABLED: 'true',
    NOTION_DATA_SOURCE: 'notion',
    NOTION_API_TOKEN: 'secret_test_token',
    NOTION_ACTIONS_DATA_SOURCE_ID: ACTIONS_DS,
    NOTION_INBOX_PAGE_ID: 'inbox-page',
    SHEETS_GYM_SESSIONS_RANGE: 'Gym Sessions!A:L',
    SHEETS_GYM_SETS_RANGE: 'Gym Sets!A:J',
  };
}

/** Espejo del loader de la página: flag off → []; flag on → listRuntimeProposals. */
async function loadApprovalsInitialProposals(
  env: Readonly<Record<string, string | undefined>>,
  overrides?: Parameters<typeof buildWriteRuntime>[1],
) {
  const writesEnabled = isWriteActionsEnabled(env);
  if (!writesEnabled) return [];
  return listRuntimeProposals(env, overrides);
}

test('aprobaciones: flag apagada no consulta repositorio y lista vacía', async () => {
  const fake = createSharedFakeClient();
  let listCalls = 0;
  const tracking: NotionActionsClient = {
    ...fake,
    async queryDataSource(dataSourceId, options) {
      listCalls += 1;
      return fake.queryDataSource(dataSourceId, options);
    },
  };

  const proposals = await loadApprovalsInitialProposals(
    { WRITE_ACTIONS_ENABLED: 'false', NODE_ENV: 'production' },
    { notionClient: tracking },
  );

  assert.equal(isWriteActionsEnabled({ WRITE_ACTIONS_ENABLED: 'false' }), false);
  assert.deepEqual(proposals, []);
  assert.equal(listCalls, 0);
});

test('aprobaciones: flag activa carga propuesta persistente en la carga inicial', async () => {
  const shared = createSharedFakeClient();
  const repo = createNotionProposalRepository({
    client: shared,
    actionsDataSourceId: ACTIONS_DS,
  });
  await repo.create(
    {
      name: 'Visible en board',
      proposedActionType: 'task.create',
      targetType: 'task',
      targetKey: null,
      reason: 'r',
      expectedChange: 'e',
      risk: 'low',
      reversible: true,
      sanitizedPayload: {},
    },
    { key: 'prop-visible', idempotencyKey: 'vis-1', createdAt: '2026-07-22' },
  );

  const proposals = await loadApprovalsInitialProposals(previewEnv(), {
    notionClient: shared,
  });

  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.key, 'prop-visible');
  assert.equal(proposals[0]?.name, 'Visible en board');
});

test('aprobaciones: dos instancias/runtime reconstruidos ven la misma propuesta', async () => {
  const shared = createSharedFakeClient();

  const runtimeA = buildWriteRuntime(previewEnv(), { notionClient: shared });
  assert.equal(runtimeA.mode, 'real');
  await runtimeA.handlers.proposals.create(
    {
      name: 'Cross-request',
      proposedActionType: 'calendar.block.propose',
      targetType: 'calendar-block',
      targetKey: null,
      reason: 'focus',
      expectedChange: '60m',
      risk: 'medium',
      reversible: true,
      sanitizedPayload: { title: 'Deep work' },
    },
    { key: 'prop-cross', idempotencyKey: 'cross-1', createdAt: '2026-07-22' },
  );

  const fromB = await listRuntimeProposals(previewEnv(), { notionClient: shared });
  assert.equal(
    fromB.some((row) => row.key === 'prop-cross'),
    true,
  );
  assert.equal(fromB.find((row) => row.key === 'prop-cross')?.name, 'Cross-request');
});

test('aprobaciones: camino real no depende de memoria legacy', () => {
  const runtimeSource = readFileSync(path.join(process.cwd(), 'lib/actions/runtime.ts'), 'utf8');
  assert.equal(/listProcessProposals/.test(runtimeSource), false);
  assert.equal(/processProposals/.test(runtimeSource), false);

  const pageSource = readFileSync(
    path.join(process.cwd(), 'app/(app)/aprobaciones/page.tsx'),
    'utf8',
  );
  assert.match(pageSource, /listRuntimeProposals/);
  assert.equal(/listProcessProposals/.test(pageSource), false);

  const runtime = buildWriteRuntime(previewEnv(), {
    notionClient: createSharedFakeClient(),
  });
  assert.equal(runtime.mode, 'real');
  assert.notEqual(runtime.status.idempotency, 'memory-test');
});

test('aprobaciones: ningún import productivo de listProcessProposals', () => {
  const roots = [
    path.join(process.cwd(), 'app'),
    path.join(process.cwd(), 'lib'),
    path.join(process.cwd(), 'components'),
  ];
  const offenders: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const content = readFileSync(full, 'utf8');
      if (content.includes('listProcessProposals')) {
        offenders.push(path.relative(process.cwd(), full));
      }
    }
  }

  for (const root of roots) walk(root);
  assert.deepEqual(offenders, []);
});
