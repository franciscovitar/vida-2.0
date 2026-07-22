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
  signCanonical,
  signaturesMatch,
  verifyOpenClawRequest,
} from '@/lib/openclaw/auth';
import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';
import {
  getOpenClawRuntimeStatus,
  isOpenClawApiEnabled,
  OPENCLAW_MAX_BODY_BYTES,
  OPENCLAW_MAX_LIST_LIMIT,
} from '@/lib/openclaw/config';
import { buildOpenClawLogEvent, openClawLogLooksSafe } from '@/lib/openclaw/observability';
import { isOpenClawProposeOperation, parseOpenClawProposalRequest } from '@/lib/openclaw/proposals';
import { createMemoryOpenClawRateLimitPort } from '@/lib/openclaw/rate-limit';
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
  const rawBody = input.rawBody ?? '';
  const signature = signCanonical(
    SECRET,
    buildCanonicalString({
      timestamp,
      method: input.method,
      pathname: input.pathname,
      rawBody,
    }),
  );
  return {
    timestamp,
    signature,
    keyId: input.keyId ?? KEY_ID,
    requestId: input.requestId ?? 'req-1',
    rawBody,
  };
}

test('openclaw: flag apagada por defecto', () => {
  assert.equal(isOpenClawApiEnabled({}), false);
  assert.equal(isOpenClawApiEnabled({ OPENCLAW_API_ENABLED: 'TRUE' }), false);
  assert.equal(getOpenClawRuntimeStatus({}), 'disabled');
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
  if (!decision.ok) assert.equal(decision.code, 'invalid-signature');
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
  if (!decision.ok) assert.equal(decision.code, 'expired-request');
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

test('openclaw: comparación timing-safe', () => {
  assert.equal(signaturesMatch('abcd', 'abcd'), true);
  assert.equal(signaturesMatch('abcd', 'abce'), false);
  assert.equal(signaturesMatch('abcd', 'abc'), false);
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
  assert.ok(caps.some((item) => item.id === 'approvals.list' && item.kind === 'read'));
  assert.ok(caps.some((item) => item.id === 'proposal.approve' && item.kind === 'forbidden'));
  assert.ok(caps.some((item) => item.id === 'task.create' && item.kind === 'forbidden'));
  assert.ok(caps.some((item) => item.id === 'gym.session.create' && item.kind === 'forbidden'));
  assert.ok(caps.some((item) => item.id === 'calendar.event.create' && item.kind === 'forbidden'));
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
  assert.equal(getOpenClawRuntimeStatus(envEnabled()), 'ready');
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

test('openclaw: rutas no exponen approve/reject ni create directo', () => {
  const proposalsRoute = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/proposals/route.ts'),
    'utf8',
  );
  assert.equal(
    /proposal\.approve|task\.create'|gym\.session\.create'/i.test(proposalsRoute),
    false,
  );
  assert.match(proposalsRoute, /createOpenClawProposal/);
});
