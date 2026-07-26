/**
 * 8F.1 — API segura OpenClaw (HMAC, contratos, propuestas). Sin I/O real.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { sanitizeActorHint, createMemoryAuditSink } from '@/lib/actions/audit';
import { executeAction } from '@/lib/actions/engine';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import { createMemoryProposalPort } from '@/lib/actions/memory-ports';
import { portHasDestructiveMethods } from '@/lib/actions/ports';
import { buildWriteRuntime } from '@/lib/actions/runtime';
import { isPublicAuthPath } from '@/lib/auth/authorize';
import {
  buildCanonicalString,
  OPENCLAW_HMAC_PROTOCOL,
  signCanonical,
  signaturesMatch,
  verifyOpenClawRequest,
} from '@/lib/openclaw/auth';
import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';
import {
  getOpenClawApiConfig,
  getOpenClawRuntimeStatus,
  isOpenClawApiEnabled,
  resolveOpenClawAccessMode,
  OPENCLAW_MAX_BODY_BYTES,
  OPENCLAW_MAX_LIST_LIMIT,
} from '@/lib/openclaw/config';
import { buildOpenClawLogEvent, openClawLogLooksSafe } from '@/lib/openclaw/observability';
import { isOpenClawProposeOperation, parseOpenClawProposalRequest } from '@/lib/openclaw/proposals';
import { createMemoryOpenClawRateLimitPort } from '@/lib/openclaw/rate-limit';
import { validateOpenClawRouteContract } from '@/lib/openclaw/route-contract';
import {
  clampOpenClawLimit,
  decodeOpenClawCursor,
  encodeOpenClawCursor,
  isCanonicalAreaSlugInput,
  isOpenClawReadOperation,
  validateCalendarUpcomingDays,
} from '@/lib/openclaw/read-input';

const KEY_ID = 'oc_test_key';
const SECRET = 'oc_test_secret_value_32chars_min!!';

function envEnabled(extra: Record<string, string> = {}) {
  return {
    OPENCLAW_API_ENABLED: 'true',
    OPENCLAW_ACCESS_MODE: 'read-only',
    OPENCLAW_API_KEY_ID: KEY_ID,
    OPENCLAW_API_SECRET: SECRET,
    NODE_ENV: 'test',
    ...extra,
  };
}

function signedHeaders(input: {
  method: string;
  pathname: string;
  rawBody?: string;
  timestamp?: string;
  keyId?: string;
  requestId?: string;
}) {
  const timestamp = input.timestamp ?? String(Date.now());
  const requestId = input.requestId ?? 'req-1';
  const rawBody = input.rawBody ?? '';
  const signature = signCanonical(
    SECRET,
    buildCanonicalString({
      timestamp,
      requestId,
      method: input.method,
      pathname: input.pathname,
      rawBody,
    }),
  );
  return {
    timestamp,
    signature,
    keyId: input.keyId ?? KEY_ID,
    requestId,
    rawBody,
  };
}

test('openclaw: flag apagada por defecto', () => {
  assert.equal(isOpenClawApiEnabled({}), false);
  assert.equal(isOpenClawApiEnabled({ OPENCLAW_API_ENABLED: 'TRUE' }), false);
  assert.equal(getOpenClawRuntimeStatus({}), 'disabled');
});

test('openclaw: access mode explícito y fail-closed', () => {
  assert.equal(resolveOpenClawAccessMode({}), 'disabled');
  assert.equal(resolveOpenClawAccessMode({ OPENCLAW_ACCESS_MODE: 'read-only' }), 'read-only');
  assert.equal(resolveOpenClawAccessMode({ OPENCLAW_ACCESS_MODE: 'full' }), 'full');
  assert.equal(resolveOpenClawAccessMode({ OPENCLAW_ACCESS_MODE: 'unknown' }), 'invalid');
  assert.equal(isOpenClawApiEnabled({ OPENCLAW_API_ENABLED: 'true' }), false);
  assert.equal(getOpenClawRuntimeStatus({ OPENCLAW_API_ENABLED: 'true' }), 'misconfigured');
  assert.equal(getOpenClawRuntimeStatus(envEnabled()), 'read-only');

  const full = getOpenClawApiConfig(envEnabled({ OPENCLAW_ACCESS_MODE: 'full' }));
  assert.equal(full.ok, false);
  if (!full.ok) assert.equal(full.reason, 'access-mode-unsupported');
});

test('openclaw: flag apagada → verify api-disabled', () => {
  const decision = verifyOpenClawRequest({
    env: { OPENCLAW_API_ENABLED: 'false' },
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: KEY_ID,
    timestampHeader: String(Date.now()),
    signatureHeader: 'x',
    requestIdHeader: 'r1',
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'api-disabled');
});

test('openclaw: health path pública en proxy (sin cookie)', () => {
  assert.equal(isPublicAuthPath('/api/openclaw/v1/health'), true);
  assert.equal(isPublicAuthPath('/api/openclaw/v1/read'), true);
});

test('openclaw: canonical HMAC v2 incluye protocolo, request ID y body hash', () => {
  const canonical = buildCanonicalString({
    timestamp: '1760000000000',
    requestId: 'req-fixed',
    method: 'post',
    pathname: '/api/openclaw/v1/read',
    rawBody: '{}',
  });

  assert.equal(
    canonical,
    [
      OPENCLAW_HMAC_PROTOCOL,
      '1760000000000',
      'req-fixed',
      'POST',
      '/api/openclaw/v1/read',
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    ].join('\n'),
  );
});

test('openclaw: firma válida', () => {
  const signed = signedHeaders({ method: 'GET', pathname: '/api/openclaw/v1/health' });
  const decision = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: signed.keyId,
    timestampHeader: signed.timestamp,
    signatureHeader: signed.signature,
    requestIdHeader: signed.requestId,
  });
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.actorId, `openclaw:${KEY_ID}`);
});

test('openclaw: firma inválida', () => {
  const signed = signedHeaders({ method: 'GET', pathname: '/api/openclaw/v1/health' });
  const decision = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: signed.keyId,
    timestampHeader: signed.timestamp,
    signatureHeader: 'deadbeef',
    requestIdHeader: signed.requestId,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'unauthorized');
});

test('openclaw: request ID modificado invalida la firma', () => {
  const signed = signedHeaders({
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    requestId: 'req-original',
  });
  const decision = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: signed.keyId,
    timestampHeader: signed.timestamp,
    signatureHeader: signed.signature,
    requestIdHeader: 'req-distinto',
  });

  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'unauthorized');
});

test('openclaw: timestamp vencido', () => {
  const old = String(Date.now() - 10 * 60 * 1000);
  const signed = signedHeaders({
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    timestamp: old,
  });
  const decision = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: signed.keyId,
    timestampHeader: signed.timestamp,
    signatureHeader: signed.signature,
    requestIdHeader: signed.requestId,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'unauthorized');
});

test('openclaw: key ID desconocida', () => {
  const signed = signedHeaders({ method: 'GET', pathname: '/api/openclaw/v1/health' });
  const decision = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: 'other',
    timestampHeader: signed.timestamp,
    signatureHeader: signed.signature,
    requestIdHeader: signed.requestId,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'unauthorized');
});

test('openclaw: comparación timing-safe exige hex lowercase exacto', () => {
  const a = 'a'.repeat(64);
  const b = `${'a'.repeat(63)}b`;
  assert.equal(signaturesMatch(a, a), true);
  assert.equal(signaturesMatch(a, b), false);
  assert.equal(signaturesMatch(a, a.toUpperCase()), false);
  assert.equal(signaturesMatch(a, ` ${a}`), false);
  assert.equal(signaturesMatch(a, 'a'.repeat(63)), false);
});

test('openclaw: request ID ausente', () => {
  const signed = signedHeaders({ method: 'GET', pathname: '/api/openclaw/v1/health' });
  const decision = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: signed.keyId,
    timestampHeader: signed.timestamp,
    signatureHeader: signed.signature,
    requestIdHeader: null,
  });
  assert.equal(decision.ok, false);
});

test('openclaw: headers HMAC usan gramáticas y longitudes cerradas', () => {
  const pathname = '/api/openclaw/v1/health';
  const verifySigned = (input: {
    requestId?: string;
    keyId?: string;
    timestamp?: string;
    signature?: string;
  }) => {
    const signed = signedHeaders({
      method: 'GET',
      pathname,
      requestId: input.requestId,
      timestamp: input.timestamp,
    });
    return verifyOpenClawRequest({
      env: envEnabled(),
      method: 'GET',
      pathname,
      rawBody: '',
      keyIdHeader: input.keyId ?? signed.keyId,
      timestampHeader: signed.timestamp,
      signatureHeader: input.signature ?? signed.signature,
      requestIdHeader: signed.requestId,
    });
  };

  for (const requestId of ['con espacio', 'a'.repeat(129), 'linea\nnueva']) {
    assert.equal(verifySigned({ requestId }).ok, false);
  }
  for (const keyId of [` ${KEY_ID}`, 'a'.repeat(65)]) {
    assert.equal(verifySigned({ keyId }).ok, false);
  }

  const now = String(Date.now());
  for (const timestamp of [`+${now}`, `${now}.0`, Number(now).toExponential()]) {
    assert.equal(verifySigned({ timestamp }).ok, false);
  }

  const valid = signedHeaders({ method: 'GET', pathname });
  assert.equal(verifySigned({ signature: valid.signature.toUpperCase() }).ok, false);
  assert.equal(verifySigned({ signature: ` ${valid.signature}` }).ok, false);
  assert.equal(verifySigned({ signature: valid.signature.slice(1) }).ok, false);
});

test('openclaw: errores de credenciales son externamente indistinguibles', () => {
  const signed = signedHeaders({ method: 'GET', pathname: '/api/openclaw/v1/health' });
  const unknownKey = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: 'other',
    timestampHeader: signed.timestamp,
    signatureHeader: signed.signature,
    requestIdHeader: signed.requestId,
  });
  const badSignature = verifyOpenClawRequest({
    env: envEnabled(),
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: signed.keyId,
    timestampHeader: signed.timestamp,
    signatureHeader: '0'.repeat(64),
    requestIdHeader: signed.requestId,
  });

  assert.equal(unknownKey.ok, false);
  assert.equal(badSignature.ok, false);
  if (!unknownKey.ok && !badSignature.ok) {
    assert.equal(unknownKey.code, 'unauthorized');
    assert.equal(badSignature.code, 'unauthorized');
    assert.equal(unknownKey.message, badSignature.message);
  }
});

test('openclaw: contrato de ruta rechaza método, path y query no canónicos', () => {
  const contract = {
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    body: 'none',
  } as const;

  assert.equal(
    validateOpenClawRouteContract(
      { method: 'GET', url: 'https://example.test/api/openclaw/v1/health' },
      contract,
    ).ok,
    true,
  );
  assert.equal(
    validateOpenClawRouteContract(
      { method: 'POST', url: 'https://example.test/api/openclaw/v1/health' },
      contract,
    ).ok,
    false,
  );
  assert.equal(
    validateOpenClawRouteContract(
      { method: 'GET', url: 'https://example.test/api/openclaw/v1/health?debug=1' },
      contract,
    ).ok,
    false,
  );
  assert.equal(
    validateOpenClawRouteContract(
      { method: 'GET', url: 'https://example.test/api/openclaw/v1/health/' },
      contract,
    ).ok,
    false,
  );

  const dynamic = {
    method: 'GET',
    pathname: /^\/api\/openclaw\/v1\/proposals\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    body: 'none',
  } as const;
  assert.equal(
    validateOpenClawRouteContract(
      { method: 'GET', url: 'https://example.test/api/openclaw/v1/proposals/key-1' },
      dynamic,
    ).ok,
    true,
  );
  assert.equal(
    validateOpenClawRouteContract(
      { method: 'GET', url: 'https://example.test/api/openclaw/v1/proposals/%2F' },
      dynamic,
    ).ok,
    false,
  );
});

test('openclaw: body max y límites', () => {
  assert.equal(OPENCLAW_MAX_BODY_BYTES, 64 * 1024);
  assert.equal(OPENCLAW_MAX_LIST_LIMIT, 50);
  assert.equal(clampOpenClawLimit(500), 50);
  assert.equal(decodeOpenClawCursor(encodeOpenClawCursor(10)), 10);
});

test('openclaw: operación no registrada / propose set cerrado', () => {
  assert.equal(isOpenClawProposeOperation('task.create'), false);
  assert.equal(isOpenClawProposeOperation('task.create.propose'), true);
  assert.equal(isOpenClawProposeOperation('proposal.approve'), false);
  assert.equal(isOpenClawReadOperation('system.overview'), true);
  assert.equal(isOpenClawReadOperation('task.create'), false);
});

test('openclaw: input propuesta inválido', () => {
  const parsed = parseOpenClawProposalRequest({ operation: 'task.create' });
  assert.equal(parsed.ok, false);
});

test('openclaw: Calendar rechaza más de 31 días', () => {
  const result = validateCalendarUpcomingDays(45);
  assert.equal(result.ok, false);
});

test('openclaw: areas solo canónicas', () => {
  assert.equal(isCanonicalAreaSlugInput('journaling'), false);
  assert.equal(isCanonicalAreaSlugInput('salud'), true);
});

test('openclaw: approvals solo lectura en capabilities', () => {
  const caps = listOpenClawCapabilities();
  const proposalIds = [
    'task.create.propose',
    'task.change-status.propose',
    'inbox.capture.propose',
    'gym.session.create.propose',
    'calendar.block.propose',
  ];

  assert.ok(caps.some((item) => item.id === 'approvals.list' && item.kind === 'read'));
  for (const id of proposalIds) {
    assert.ok(caps.some((item) => item.id === id && item.kind === 'forbidden'));
  }
  assert.equal(caps.filter((item) => item.kind === 'proposal').length, 0);
  assert.ok(caps.some((item) => item.id === 'proposal.approve' && item.kind === 'forbidden'));
  assert.ok(caps.some((item) => item.id === 'task.create' && item.kind === 'forbidden'));
  assert.ok(caps.some((item) => item.id === 'gym.session.create' && item.kind === 'forbidden'));
  assert.ok(caps.some((item) => item.id === 'calendar.event.create' && item.kind === 'forbidden'));
});

test('openclaw: health y capabilities exponen solo el contrato read-only', () => {
  const root = process.cwd();
  const health = readFileSync(path.join(root, 'app/api/openclaw/v1/health/route.ts'), 'utf8');
  const capabilities = readFileSync(
    path.join(root, 'app/api/openclaw/v1/capabilities/route.ts'),
    'utf8',
  );

  assert.equal(health.includes('writesEnabled'), false);
  assert.match(health, /accessMode/);
  assert.match(capabilities, /accessMode/);
  assert.match(capabilities, /item\.kind === 'proposal'/);
});

test('openclaw: Journaling forbidden y actor sanitizado', () => {
  const caps = listOpenClawCapabilities();
  assert.ok(caps.some((item) => item.id === 'journaling.read' && item.kind === 'forbidden'));
  assert.match(sanitizeActorHint('openclaw:abcdef'), /^openclaw:ab\*\*\*$/);
});

test('openclaw: propuesta calendar pending + board memoria', async () => {
  const proposals = createMemoryProposalPort();
  const handlers = buildWriteRuntime(
    { NODE_ENV: 'test', WRITE_ACTIONS_ENABLED: 'true', WRITE_ACTIONS_USE_MEMORY: 'true' },
    { proposals },
  ).handlers;
  const applied = await executeAction(
    {
      actionType: 'proposal.create',
      actorEmail: 'openclaw:test',
      payload: {
        title: 'Deep work',
        date: '2026-07-23',
        startTime: '10:00',
        endTime: '11:00',
        reason: 'Enfoque',
        relatedTaskKey: null,
      },
      idempotencyKey: 'oc-cal-direct',
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'openclaw', targetDate: null },
    },
    {
      writesEnabled: true,
      idempotency: createMemoryIdempotencyStore(),
      audit: createMemoryAuditSink(),
      handlers,
    },
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.target?.type, 'proposal');
  const listed = await proposals.list('pending');
  assert.ok(listed.length >= 1);
  assert.equal(listed[0]?.status, 'pending');
});

test('openclaw: misma idempotencyKey no duplica', async () => {
  const proposals = createMemoryProposalPort();
  const idem = createMemoryIdempotencyStore();
  const audit = createMemoryAuditSink();
  const handlers = buildWriteRuntime(
    { NODE_ENV: 'test', WRITE_ACTIONS_ENABLED: 'true', WRITE_ACTIONS_USE_MEMORY: 'true' },
    { proposals },
  ).handlers;
  const payload = {
    title: 'Bloque',
    date: '2026-07-23',
    startTime: '09:00',
    endTime: '10:00',
    reason: 'r',
    relatedTaskKey: null,
  };
  const first = await executeAction(
    {
      actionType: 'proposal.create',
      actorEmail: 'openclaw:k',
      payload,
      idempotencyKey: 'same-oc',
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'openclaw', targetDate: null },
    },
    { writesEnabled: true, idempotency: idem, audit, handlers },
  );
  const second = await executeAction(
    {
      actionType: 'proposal.create',
      actorEmail: 'openclaw:k',
      payload,
      idempotencyKey: 'same-oc',
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'openclaw', targetDate: null },
    },
    { writesEnabled: true, idempotency: idem, audit, handlers },
  );
  assert.equal(first.ok, true);
  assert.equal(second.code, 'idempotent-replay');
  assert.equal((await proposals.list()).length, 1);
});

test('openclaw: logs y status sin secretos', () => {
  const event = buildOpenClawLogEvent({
    requestId: 'r',
    operation: 'health',
    keyId: KEY_ID,
    durationMs: 12,
    result: 'ok',
  });
  assert.equal(openClawLogLooksSafe(event), true);
  assert.equal(JSON.stringify(event).includes(SECRET), false);
  assert.equal(JSON.stringify(event).includes(KEY_ID), false);
  assert.equal(JSON.stringify(event).includes('proposalCreated'), false);
  assert.match(event.requestTrace, /^[0-9a-f]{32}$/);
  assert.match(event.clientTrace, /^[0-9a-f]{32}$/);
  assert.equal(getOpenClawRuntimeStatus(envEnabled()), 'read-only');
  assert.equal(getOpenClawRuntimeStatus({ OPENCLAW_API_ENABLED: 'true' }), 'misconfigured');
});

test('openclaw: OpenAPI contiene rutas', () => {
  const yaml = readFileSync(path.join(process.cwd(), 'docs/openclaw-openapi.yaml'), 'utf8');
  assert.match(yaml, /\/health/);
  assert.match(yaml, /\/capabilities/);
  assert.match(yaml, /\/read/);
  assert.match(yaml, /\/proposals/);
  assert.match(yaml, /\/proposals\/\{key\}/);
});

test('openclaw: sin métodos destructivos / rate limit memory', async () => {
  assert.equal(portHasDestructiveMethods(createMemoryProposalPort()), false);
  const rate = createMemoryOpenClawRateLimitPort();
  assert.equal((await rate.allow('k', 1)).ok, true);
  assert.equal((await rate.allow('k', 1)).ok, false);
});

test('openclaw: health route no consulta fuentes (código)', () => {
  const health = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/health/route.ts'),
    'utf8',
  );
  assert.equal(/loadNotion|getCalendar|getGoogle|sheets/i.test(health), false);
  assert.match(health, /capabilitiesVersion/);
});

test('openclaw: rutas de propuestas están físicamente aisladas de escrituras', () => {
  const routePaths = [
    'app/api/openclaw/v1/proposals/route.ts',
    'app/api/openclaw/v1/proposals/[key]/route.ts',
  ];

  for (const routePath of routePaths) {
    const source = readFileSync(path.join(process.cwd(), routePath), 'utf8');
    for (const forbidden of [
      '@/lib/openclaw/proposals',
      'createOpenClawProposal',
      'getOpenClawProposal',
      'parseOpenClawProposalRequest',
      'buildWriteRuntime',
      'executeAction',
      'WRITE_ACTIONS_ENABLED',
      'finishOpenClawOk',
    ]) {
      assert.equal(source.includes(forbidden), false, `${routePath}: ${forbidden}`);
    }
    assert.match(source, /parseAndAuthenticateOpenClawRequest/);
    assert.match(source, /finishOpenClawError/);
    assert.match(source, /403/);
    assert.match(source, /'forbidden'/);
    assert.match(source, /modo read-only/);
  }
});

test('openclaw: OpenAPI no ofrece éxito ni payload para propuestas en read-only', () => {
  const yaml = readFileSync(path.join(process.cwd(), 'docs/openclaw-openapi.yaml'), 'utf8');
  const proposalSection = yaml.slice(yaml.indexOf('  /proposals:'));

  assert.match(proposalSection, /deprecated: true/);
  assert.match(proposalSection, /Operación bloqueada en modo read-only/);
  assert.equal(proposalSection.includes('Propuesta creada o replay'), false);
  assert.equal(proposalSection.includes('Obtener propuesta por clave opaca'), false);
  assert.equal(proposalSection.includes('idempotencyKey'), false);
  assert.equal(proposalSection.includes("        '200':"), false);
});
