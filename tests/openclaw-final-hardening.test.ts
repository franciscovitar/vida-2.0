import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  OPENCLAW_MAX_RESPONSE_BYTES,
  validateOpenClawReadBoundary,
  validateOpenClawSerializedResponseSize,
} from '@/lib/openclaw/read-boundary';
import { validateOpenClawReadEnvelope } from '@/lib/openclaw/read-contract';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import { encodeOpenClawCursor } from '@/lib/openclaw/read-input';
import {
  buildOpenClawLogEvent,
  openClawClientTrace,
  openClawLogLooksSafe,
  openClawRequestTrace,
} from '@/lib/openclaw/observability';
import {
  authorizeFreshGeneralAIEntry,
  canUseWebCatalogEntryInGeneralAI,
} from '@/lib/web-catalog/policy';
import { searchWebCatalogDocuments } from '@/lib/web-catalog/search';
import type { WebCatalogEntry } from '@/types/web-catalog';
import { OPENCLAW_READ_OPERATIONS } from '@/lib/openclaw/read-input';

function catalogEntry(
  generalAI: WebCatalogEntry['policy']['generalAI'],
  stableKey = 'doc.safe',
): WebCatalogEntry {
  return {
    stableKey,
    editorialName: 'Documento seguro',
    sourceRef: 'opaque-server-only',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'reference',
    slug: 'documento-seguro',
    aliases: ['doc-alias'],
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

const VALID_API_ENV = {
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  OPENCLAW_API_KEY_ID: 'preview-key',
  OPENCLAW_API_SECRET: 'preview-secret-value',
} as const;

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
  assert.equal(validateOpenClawReadEnvelope({ operation: 'system.overview' }).ok, false);
  assert.equal(
    validateOpenClawReadEnvelope({ operation: 'system.overview', input: null }).ok,
    false,
  );
  assert.equal(validateOpenClawReadEnvelope({ operation: 'system.overview', input: [] }).ok, false);
  assert.equal(
    validateOpenClawReadEnvelope({ operation: 'system.overview', input: 'x' }).ok,
    false,
  );
});

test('openclaw final: cada variante válida del contrato pasa', () => {
  const variants = [
    { operation: 'system.overview', input: {} },
    { operation: 'areas.list', input: {} },
    { operation: 'areas.get', input: { slug: 'facultad' } },
    { operation: 'areas.get', input: { areaKey: 'area.salud' } },
    {
      operation: 'tasks.list',
      input: {
        status: 'Pendiente',
        areaKey: 'area-abc123',
        projectKey: 'proj-z9',
        dueBefore: '2026-07-31',
        limit: 20,
        cursor: encodeOpenClawCursor(20),
      },
    },
    { operation: 'projects.list', input: { status: 'Activo', limit: 10 } },
    { operation: 'calendar.upcoming', input: {} },
    { operation: 'calendar.upcoming', input: { days: 7 } },
    { operation: 'gym.summary', input: {} },
    { operation: 'approvals.list', input: { status: 'pending', limit: 5 } },
    { operation: 'documents.search', input: { query: '  salud  ' } },
    { operation: 'document.get', input: { slug: 'documento-seguro' } },
  ] as const;

  for (const variant of variants) {
    const result = validateOpenClawReadEnvelope(variant);
    assert.equal(result.ok, true, JSON.stringify(variant));
  }
});

test('openclaw final: areas.get preserva slug o areaKey sin normalizar', () => {
  const bySlug = validateOpenClawReadEnvelope({
    operation: 'areas.get',
    input: { slug: 'facultad' },
  });
  assert.equal(bySlug.ok, true);
  if (bySlug.ok) assert.deepEqual(bySlug.value.input, { slug: 'facultad' });

  const byKey = validateOpenClawReadEnvelope({
    operation: 'areas.get',
    input: { areaKey: 'area.facultad' },
  });
  assert.equal(byKey.ok, true);
  if (byKey.ok) assert.deepEqual(byKey.value.input, { areaKey: 'area.facultad' });
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
  const search = validateOpenClawReadEnvelope({
    operation: 'documents.search',
    input: { query: '  salud  ' },
  });
  assert.equal(search.ok, true);
  if (search.ok) {
    assert.equal(search.value.operation, 'documents.search');
    assert.equal(search.value.input.query, 'salud');
  }
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

test('openclaw final: frontera acepta DTO seguro y texto normal', () => {
  assert.deepEqual(
    validateOpenClawReadBoundary({
      data: {
        tasks: [
          {
            key: 'task-abc',
            title: 'Preparar parcial de análisis',
            status: 'Pendiente',
            href: '/tareas',
            notePreview: 'Revisar apuntes de la unidad 3',
          },
        ],
      },
      sources: ['notion'],
      warnings: [],
      nextCursor: null,
      itemCount: 1,
      dataFreshness: 'live',
    }),
    { ok: true },
  );
});

test('openclaw final: frontera bloquea IDs, secretos, URLs y emails en texto', () => {
  for (const data of [
    { id: 'internal' },
    { notionId: 'internal' },
    { sourceRef: 'opaque' },
    { refreshToken: 'x' },
    { userEmail: 'hidden' },
    { mail: 'hidden' },
    { ownerEmail: 'hidden' },
    { createdBy: 'actor' },
    { raw: 'payload' },
    { metadata: { a: 1 } },
    { text: 'Bearer abc' },
    { text: 'https://www.notion.so/private' },
    { href: 'https://example.com' },
    { text: 'Journaling privado' },
    { text: 'persona@example.com' },
    { text: 'Nombre <persona@example.com>' },
    { text: 'contacto: usuario+tag@sub.dominio.com' },
    {
      blocksPreview: [{ type: 'paragraph', text: 'Escribir a persona@example.com para dudas' }],
    },
  ]) {
    assert.equal(validateOpenClawReadBoundary(data).ok, false, JSON.stringify(data));
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

test('openclaw final: tamaño se mide sobre el envelope completo', () => {
  // El DTO cabe; ok/requestId/generatedAt/operation empujan el JSON final sobre 256 KiB.
  const emptyDto = {
    dataFreshness: 'live' as const,
    sources: ['notion'],
    warnings: [] as string[],
    nextCursor: null,
    itemCount: 0,
    data: { chunks: [] as string[] },
  };
  const emptyResponse = {
    ok: true as const,
    requestId: 'req_0123456789abcdef0123456789abcdef',
    generatedAt: '2026-07-26T12:00:00.000Z',
    operation: 'tasks.list' as const,
    ...emptyDto,
  };
  const overhead =
    Buffer.byteLength(JSON.stringify(emptyResponse), 'utf8') -
    Buffer.byteLength(JSON.stringify(emptyDto), 'utf8');
  assert.ok(overhead > 0);

  const chunks: string[] = [];
  const piece = 'y'.repeat(3_500);
  for (;;) {
    const candidateDto = {
      ...emptyDto,
      itemCount: chunks.length + 1,
      data: { chunks: [...chunks, piece] },
    };
    const bytes = Buffer.byteLength(JSON.stringify(candidateDto), 'utf8');
    if (bytes > OPENCLAW_MAX_RESPONSE_BYTES - overhead) break;
    chunks.push(piece);
    if (chunks.length >= 200) break;
  }

  // Relleno: DTO ≤ MAX, pero DTO + overhead del envelope > MAX.
  const dtoSize = (padValue: string) =>
    Buffer.byteLength(
      JSON.stringify({
        ...emptyDto,
        itemCount: chunks.length,
        data: { chunks, pad: padValue },
      }),
      'utf8',
    );
  const targetMin = OPENCLAW_MAX_RESPONSE_BYTES - overhead + 1;
  let lo = 0;
  let hi = 3_900;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (dtoSize('y'.repeat(mid)) <= OPENCLAW_MAX_RESPONSE_BYTES) lo = mid;
    else hi = mid - 1;
  }
  let pad = 'y'.repeat(lo);
  while (dtoSize(pad) < targetMin && pad.length < 3_900) {
    pad = `${pad}y`;
  }

  const dto = {
    ...emptyDto,
    itemCount: chunks.length,
    data: { chunks, pad },
  };
  const response = {
    ok: true as const,
    requestId: 'req_0123456789abcdef0123456789abcdef',
    generatedAt: '2026-07-26T12:00:00.000Z',
    operation: 'tasks.list' as const,
    ...dto,
  };

  const dtoBytes = Buffer.byteLength(JSON.stringify(dto), 'utf8');
  const responseBytes = Buffer.byteLength(JSON.stringify(response), 'utf8');
  assert.equal(validateOpenClawReadBoundary(dto).ok, true);
  assert.ok(dtoBytes <= OPENCLAW_MAX_RESPONSE_BYTES);
  assert.ok(dtoBytes > OPENCLAW_MAX_RESPONSE_BYTES - overhead);
  assert.ok(responseBytes > OPENCLAW_MAX_RESPONSE_BYTES);
  assert.equal(validateOpenClawSerializedResponseSize(response).ok, false);

  const small = {
    ok: true as const,
    requestId: 'req_small',
    generatedAt: '2026-07-26T12:00:00.000Z',
    operation: 'areas.list' as const,
    dataFreshness: 'live' as const,
    sources: ['notion'],
    warnings: [] as string[],
    nextCursor: null,
    itemCount: 0,
    data: { areas: [] as unknown[] },
  };
  assert.equal(validateOpenClawSerializedResponseSize(small).ok, true);
});

test('openclaw final: logs usan trazas opacas y métricas autorizadas', () => {
  const requestId = 'req_plain_value_1234567890abcdef';
  const keyId = 'client-key-id-plain';
  const event = buildOpenClawLogEvent({
    requestId,
    operation: 'tasks.list',
    keyId,
    durationMs: 12,
    result: 'ok',
    itemCount: 3,
    sourceCount: 1,
    dataFreshness: 'live',
  });

  const json = JSON.stringify(event);
  assert.equal(json.includes(requestId), false);
  assert.equal(json.includes(keyId), false);
  assert.equal(json.includes('proposalCreated'), false);
  assert.equal(json.includes('requestId'), false);
  assert.equal(json.includes('keyId'), false);
  assert.match(event.requestTrace, /^[0-9a-f]{32}$/);
  assert.match(event.clientTrace, /^[0-9a-f]{32}$/);
  assert.equal(event.requestTrace, openClawRequestTrace(requestId));
  assert.equal(event.clientTrace, openClawClientTrace(keyId));
  assert.notEqual(
    event.requestTrace,
    createHash('sha256').update(`vida2:openclaw:client:${requestId}`).digest('hex').slice(0, 32),
  );
  assert.equal(openClawLogLooksSafe(event), true);

  const unsafe = {
    ...event,
    note: 'secret_abc Bearer token',
  };
  assert.equal(openClawLogLooksSafe(unsafe as typeof event), false);
});

test('openclaw final: generalAI solo acepta allowed explícito', () => {
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('allowed')), true);
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('limited')), false);
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('explicit-authorization')), false);
  assert.equal(canUseWebCatalogEntryInGeneralAI(catalogEntry('denied')), false);
});

test('openclaw final: revocación generalAI usa catálogo fresco', () => {
  const allowed = catalogEntry('allowed', 'doc.revocable');
  const revoked = catalogEntry('denied', 'doc.revocable');

  assert.equal(authorizeFreshGeneralAIEntry(allowed.stableKey, [allowed]).ok, true);
  assert.deepEqual(authorizeFreshGeneralAIEntry(allowed.stableKey, [revoked]), {
    ok: false,
    code: 'forbidden-policy',
  });

  const cachedIndexDoc = {
    stableKey: 'doc.revocable',
    title: 'Guía de estudio',
    section: 'reference' as const,
    aliases: [],
    href: '/p/documento-seguro',
    body: 'Contenido de estudio sobre salud',
  };
  // Igual que searchWebCatalogForGeneralAI: cruza índice cacheado con fresco+generalAI.
  const freshAllowed = [allowed].filter((entry) => canUseWebCatalogEntryInGeneralAI(entry));
  const freshRevoked = [revoked].filter((entry) => canUseWebCatalogEntryInGeneralAI(entry));
  assert.equal(freshAllowed.length, 1);
  assert.equal(freshRevoked.length, 0);
  const hitsWhileAllowed = searchWebCatalogDocuments([cachedIndexDoc], 'salud', freshAllowed);
  assert.equal(hitsWhileAllowed.length, 1);
  const hitsAfterRevoke = searchWebCatalogDocuments([cachedIndexDoc], 'salud', freshRevoked);
  assert.equal(hitsAfterRevoke.length, 0);

  const service = readFileSync(path.join(process.cwd(), 'lib/web-catalog/service.ts'), 'utf8');
  const generalAiBlock = service.slice(
    service.indexOf('resolveWebCatalogPageForGeneralAI'),
    service.indexOf('resolveWebCatalogPageByStableKey'),
  );
  assert.match(generalAiBlock, /loadValidatedWebCatalog/);
  assert.match(generalAiBlock, /authorizeFreshGeneralAIEntry/);
  assert.equal(generalAiBlock.includes('loadCatalogForRequest'), false);
  assert.ok(
    generalAiBlock.indexOf('authorizeFreshGeneralAIEntry') < generalAiBlock.indexOf('redirect'),
  );
  assert.ok(
    generalAiBlock.indexOf('authorizeFreshGeneralAIEntry') <
      generalAiBlock.indexOf('loadDocumentForEntry'),
  );
});

test('openclaw final: Production con API apagada nunca ready', () => {
  const result = getOpenClawReadiness({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    OPENCLAW_API_ENABLED: 'false',
    OPENCLAW_ACCESS_MODE: 'disabled',
    OPENCLAW_RATE_LIMIT_MODE: 'upstash',
    OPENCLAW_REPLAY_MODE: 'upstash',
    UPSTASH_REDIS_REST_URL: 'https://unit-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token_12345678901234567890',
    NOTION_DATA_SOURCE: 'mock',
    DATA_SOURCE: 'mock',
    GOOGLE_CALENDAR_DATA_SOURCE: 'mock',
  });
  assert.equal(result.apiStatus, 'disabled');
  assert.equal(result.status, 'disabled');
  assert.notEqual(result.status, 'ready');
});

test('openclaw final: mode full o HMAC incompleto bloquean', () => {
  const full = getOpenClawReadiness({
    ...VALID_API_ENV,
    OPENCLAW_ACCESS_MODE: 'full',
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'upstash',
    OPENCLAW_REPLAY_MODE: 'upstash',
    UPSTASH_REDIS_REST_URL: 'https://unit-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token_12345678901234567890',
  });
  assert.equal(full.apiStatus, 'misconfigured');
  assert.equal(full.status, 'blocked');

  const missingSecret = getOpenClawReadiness({
    OPENCLAW_API_ENABLED: 'true',
    OPENCLAW_ACCESS_MODE: 'read-only',
    OPENCLAW_API_KEY_ID: 'preview-key',
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'upstash',
    OPENCLAW_REPLAY_MODE: 'upstash',
    UPSTASH_REDIS_REST_URL: 'https://unit-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token_12345678901234567890',
  });
  assert.equal(missingSecret.apiStatus, 'misconfigured');
  assert.equal(missingSecret.status, 'blocked');
});

test('openclaw final: Vercel memory blocked; Upstash completo puede ready security', () => {
  const blocked = getOpenClawReadiness({
    ...VALID_API_ENV,
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'memory',
    OPENCLAW_REPLAY_MODE: 'memory',
  });
  assert.equal(blocked.securityControls, 'blocked');
  assert.equal(blocked.status, 'blocked');

  const ready = getOpenClawReadiness({
    ...VALID_API_ENV,
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'upstash',
    OPENCLAW_REPLAY_MODE: 'upstash',
    UPSTASH_REDIS_REST_URL: 'https://unit-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token_12345678901234567890',
    NOTION_DATA_SOURCE: 'mock',
    DATA_SOURCE: 'mock',
    GOOGLE_CALENDAR_DATA_SOURCE: 'mock',
    WEB_CATALOG_ENABLED: 'true',
    NOTION_WEB_CATALOG_DATA_SOURCE_ID: 'ds',
    NOTION_API_TOKEN: 'notion-token',
  });
  assert.equal(ready.apiStatus, 'read-only');
  assert.equal(ready.securityControls, 'ready');
  assert.equal(ready.readers['approvals.list'], 'unavailable');
});

test('openclaw final: readiness nunca expone secretos', () => {
  const secret = 'token_12345678901234567890';
  const result = getOpenClawReadiness({
    ...VALID_API_ENV,
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
  const json = JSON.stringify(result);
  assert.equal(json.includes(secret), false);
  assert.equal(json.includes('preview-secret-value'), false);
  assert.equal(json.includes('https://unit-test.upstash.io'), false);
  assert.equal(result.readers['tasks.list'], 'degraded');
  assert.equal(result.status, 'degraded');
});

test('openclaw final: route usa contrato, frontera y tamaño del envelope', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/read/route.ts'),
    'utf8',
  );
  assert.match(source, /validateOpenClawReadEnvelope/);
  assert.match(source, /validateOpenClawReadBoundary/);
  assert.match(source, /validateOpenClawSerializedResponseSize/);
  assert.match(source, /itemCount: result\.itemCount/);
  assert.equal(source.includes('const READ_OPS'), false);
});

test('openclaw final: reads no importa runtime de escrituras', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/openclaw/reads.ts'), 'utf8');
  assert.match(source, /searchWebCatalogForGeneralAI/);
  assert.match(source, /resolveWebCatalogPageForGeneralAI/);
  assert.equal(/await searchWebCatalog\(query\)/.test(source), false);
  assert.equal(/await resolveWebCatalogPage\(slug\)/.test(source), false);
  assert.equal(source.includes('listRuntimeProposals'), false);
  assert.equal(source.includes('buildWriteRuntime'), false);
  assert.equal(source.includes('createNotionProposalRepository'), false);
  assert.match(source, /source-unavailable/);
  assert.match(source, /pendingProposals: null/);
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
  assert.match(health, /apiStatus/);
  assert.equal(/loadNotion|getCalendar|getGoogle|sheets/i.test(health), false);
  assert.match(capabilities, /availability/);
  assert.match(capabilities, /readiness/);
});

test('openclaw final: OpenAPI oneOf alineado con las 10 operaciones', () => {
  const yaml = readFileSync(path.join(process.cwd(), 'docs/openclaw-openapi.yaml'), 'utf8');
  assert.match(yaml, /OpenClawReadEnvelope/);
  assert.match(yaml, /oneOf:/);
  assert.match(yaml, /additionalProperties:\s*false/);
  for (const operation of OPENCLAW_READ_OPERATIONS) {
    assert.match(yaml, new RegExp(`const:\\s*${operation.replace('.', '\\.')}`));
  }
  assert.equal((yaml.match(/const:\s*[a-z]+\.[a-z]+/g) ?? []).length, 10);
});
