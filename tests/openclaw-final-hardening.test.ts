import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { validateOpenClawReadBoundary } from '@/lib/openclaw/read-boundary';
import { validateOpenClawReadEnvelope } from '@/lib/openclaw/read-contract';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import { encodeOpenClawCursor } from '@/lib/openclaw/read-input';
import { canUseWebCatalogEntryInGeneralAI } from '@/lib/web-catalog/policy';
import type { WebCatalogEntry } from '@/types/web-catalog';

function catalogEntry(generalAI: WebCatalogEntry['policy']['generalAI']): WebCatalogEntry {
  return {
    stableKey: 'doc.safe',
    editorialName: 'Documento seguro',
    sourceRef: 'opaque-server-only',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'reference',
    slug: 'documento-seguro',
    aliases: [],
    navigationPlacement: 'none',
    navigationOrder: null,
    renderMode: 'document',
    privacy: 'general',
    policy: {
      visibleWeb: true,
      searchable: true,
      generalAI,
      reviewAI: 'allowed',
      writeMode: 'none',
      confirmation: 'none',
    },
  };
}

test('openclaw final: envelope y campos desconocidos fallan cerrados', () => {
  assert.equal(validateOpenClawReadEnvelope(null).ok, false);
  assert.equal(
    validateOpenClawReadEnvelope({
      operation: 'system.overview',
      input: {},
      extra: true,
    }).ok,
    false,
  );
  assert.equal(
    validateOpenClawReadEnvelope({
      operation: 'system.overview',
      input: { limit: 1 },
    }).ok,
    false,
  );
});

test('openclaw final: areas.get normaliza la clave canónica', () => {
  const result = validateOpenClawReadEnvelope({
    operation: 'areas.get',
    input: { areaKey: 'area.facultad' },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.input, { slug: 'facultad' });
});

test('openclaw final: tasks.list aplica schema estricto', () => {
  assert.equal(
    validateOpenClawReadEnvelope({
      operation: 'tasks.list',
      input: {
        status: 'Pendiente',
        areaKey: 'area-abc123',
        projectKey: 'proj-z9',
        dueBefore: '2026-07-31',
        limit: 20,
        cursor: encodeOpenClawCursor(20),
      },
    }).ok,
    true,
  );

  for (const input of [
    { status: 'pendiente' },
    { areaKey: 'area.facultad' },
    { dueBefore: '2026-02-31' },
    { limit: '20' },
    { limit: 51 },
    { cursor: 'bad!' },
    { unexpected: true },
  ]) {
    assert.equal(validateOpenClawReadEnvelope({ operation: 'tasks.list', input }).ok, false);
  }
});

test('openclaw final: Calendar no acepta coerción numérica', () => {
  assert.equal(
    validateOpenClawReadEnvelope({
      operation: 'calendar.upcoming',
      input: { days: 31 },
    }).ok,
    true,
  );
  for (const days of ['7', 0, 32, 1.5]) {
    assert.equal(
      validateOpenClawReadEnvelope({
        operation: 'calendar.upcoming',
        input: { days },
      }).ok,
      false,
    );
  }
});

test('openclaw final: documentos exigen query y slug acotados', () => {
  assert.equal(
    validateOpenClawReadEnvelope({
      operation: 'documents.search',
      input: { query: '  salud  ' },
    }).ok,
    true,
  );
  assert.equal(
    validateOpenClawReadEnvelope({
      operation: 'documents.search',
      input: { query: '   ' },
    }).ok,
    false,
  );
  assert.equal(
    validateOpenClawReadEnvelope({
      operation: 'document.get',
      input: { slug: '../private' },
    }).ok,
    false,
  );
});

test('openclaw final: frontera acepta DTO seguro', () => {
  assert.deepEqual(
    validateOpenClawReadBoundary({
      data: {
        tasks: [
          {
            key: 'task-abc',
            title: 'Preparar parcial',
            status: 'Pendiente',
            href: '/tareas',
          },
        ],
      },
      sources: ['notion'],
      warnings: [],
      nextCursor: null,
      itemCount: 1,
    }),
    { ok: true },
  );
});

test('openclaw final: frontera bloquea IDs, secretos y URLs', () => {
  for (const data of [
    { id: 'internal' },
    { notionId: 'internal' },
    { sourceRef: 'opaque' },
    { refreshToken: 'x' },
    { text: 'Bearer abc' },
    { text: 'https://www.notion.so/private' },
    { href: 'https://example.com' },
    { text: 'Journaling privado' },
  ]) {
    assert.equal(validateOpenClawReadBoundary(data).ok, false);
  }
});

test('openclaw final: frontera bloquea ciclos y profundidad excesiva', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(validateOpenClawReadBoundary(cyclic).ok, false);

  let cursor: Record<string, unknown> = {};
  const root = cursor;
  for (let index = 0; index < 20; index += 1) {
    cursor.child = {};
    cursor = cursor.child as Record<string, unknown>;
  }
  assert.equal(validateOpenClawReadBoundary(root).ok, false);
});

test('openclaw final: generalAI solo acepta allowed explícito', () => {
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('allowed')), true);
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('limited')), false);
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('explicit-authorization')), false);
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('denied')), false);
});

test('openclaw final: Vercel exige store distribuido completo', () => {
  const blocked = getOpenClawReadiness({
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'memory',
    OPENCLAW_REPLAY_MODE: 'memory',
  });
  assert.equal(blocked.securityControls, 'blocked');

  const ready = getOpenClawReadiness({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'upstash',
    OPENCLAW_REPLAY_MODE: 'upstash',
    UPSTASH_REDIS_REST_URL: 'https://unit-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token_12345678901234567890',
  });
  assert.equal(ready.securityControls, 'ready');
});

test('openclaw final: readiness nunca expone secretos', () => {
  const secret = 'token_12345678901234567890';
  const result = getOpenClawReadiness({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'upstash',
    OPENCLAW_REPLAY_MODE: 'upstash',
    UPSTASH_REDIS_REST_URL: 'https://unit-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: secret,
    NOTION_DATA_SOURCE: 'mock',
    DATA_SOURCE: 'mock',
    GOOGLE_CALENDAR_DATA_SOURCE: 'mock',
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.readers['tasks.list'], 'degraded');
});

test('openclaw final: route usa contrato único y frontera', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/read/route.ts'),
    'utf8',
  );
  assert.match(source, /validateOpenClawReadEnvelope/);
  assert.match(source, /validateOpenClawReadBoundary/);
  assert.match(source, /itemCount: result\.itemCount/);
  assert.equal(source.includes('const READ_OPS'), false);
});

test('openclaw final: documentos usan lectores generalAI dedicados', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/openclaw/reads.ts'), 'utf8');
  assert.match(source, /searchWebCatalogForGeneralAI/);
  assert.match(source, /resolveWebCatalogPageForGeneralAI/);
  assert.equal(/await searchWebCatalog\(query\)/.test(source), false);
  assert.equal(/await resolveWebCatalogPage\(slug\)/.test(source), false);
});

test('openclaw final: health y capabilities publican readiness sin I/O', () => {
  const health = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/health/route.ts'),
    'utf8',
  );
  const capabilities = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/capabilities/route.ts'),
    'utf8',
  );
  assert.match(health, /getOpenClawReadiness/);
  assert.match(health, /securityControls/);
  assert.equal(/loadNotion|getCalendar|getGoogle|sheets/i.test(health), false);
  assert.match(capabilities, /availability/);
  assert.match(capabilities, /readiness/);
});
