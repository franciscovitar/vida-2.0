import { createHash, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { isAutomationsResultCallbackEnabled } from '@/lib/automations/config';
import {
  getAutomationPrincipalContract,
  isAutomationPrincipalKey,
} from '@/lib/automations/contracts';
import {
  AUTOMATIONS_N8N_SECRET_HEADER,
  resolveN8nClientConfig,
} from '@/lib/automations/n8n-client';
import {
  buildAutomationRuntime,
  type AutomationResultInput,
  type AutomationRuntime,
} from '@/lib/automations/runtime';
import { buildAutomationStateStore, type AutomationStateStore } from '@/lib/automations/store';
import {
  decodeOpenClawUtf8,
  parseOpenClawJsonStrict,
  readOpenClawBodyBytes,
} from '@/lib/openclaw/body';
import { validateOpenClawRouteContract } from '@/lib/openclaw/route-contract';
import { AUTOMATION_RESULT_CODES, type AutomationResultCode } from '@/types/automations';

const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const OPAQUE_RUN_PATTERN = /^run_[A-Za-z0-9_-]{20,80}$/;
const OPAQUE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const SENSITIVE_PATTERN =
  /(?:https?:\/\/|bearer\s|secret|token|signature|key.?id|journal|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function response(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function secretsMatch(expected: string, provided: string): boolean {
  const left = createHash('sha256').update(expected, 'utf8').digest();
  const right = createHash('sha256').update(provided, 'utf8').digest();
  return timingSafeEqual(left, right);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedSafeString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !SENSITIVE_PATTERN.test(value)
  );
}

export function parseAutomationResultDto(value: unknown): AutomationResultInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const dto = value as Record<string, unknown>;
  if (
    !exactKeys(dto, [
      'runKey',
      'workflowKey',
      'principalKey',
      'status',
      'resultCode',
      'summary',
      'proposalKey',
      'artifact',
    ])
  )
    return null;
  if (typeof dto.runKey !== 'string' || !OPAQUE_RUN_PATTERN.test(dto.runKey)) return null;
  const principalKey = String(dto.principalKey);
  if (!isAutomationPrincipalKey(principalKey)) return null;
  const principal = getAutomationPrincipalContract(principalKey);
  if (dto.workflowKey !== principal.workflowKey) return null;
  if (!['succeeded', 'failed', 'skipped', 'cancelled'].includes(String(dto.status))) return null;
  if (!(AUTOMATION_RESULT_CODES as readonly unknown[]).includes(dto.resultCode)) return null;
  const code = dto.resultCode as AutomationResultCode;
  const allowedCodes: Record<
    'succeeded' | 'failed' | 'skipped' | 'cancelled',
    readonly AutomationResultCode[]
  > = {
    succeeded: ['completed', 'no-change', 'proposal-created'],
    failed: ['invalid-result', 'timed-out'],
    skipped: ['no-change', 'cancelled'],
    cancelled: ['cancelled'],
  };
  if (!allowedCodes[dto.status as 'succeeded' | 'failed' | 'skipped' | 'cancelled'].includes(code))
    return null;
  if (!boundedSafeString(dto.summary, 500)) return null;
  if (
    dto.proposalKey !== null &&
    (typeof dto.proposalKey !== 'string' || !OPAQUE_REFERENCE_PATTERN.test(dto.proposalKey))
  )
    return null;
  if (code === 'proposal-created' && principal.workflowKey !== 'planning-suggestion') return null;
  if (code === 'proposal-created' && dto.proposalKey === null) return null;

  let artifact: AutomationResultInput['artifact'] = null;
  if (dto.artifact !== null) {
    if (!dto.artifact || typeof dto.artifact !== 'object' || Array.isArray(dto.artifact))
      return null;
    const raw = dto.artifact as Record<string, unknown>;
    if (
      !exactKeys(raw, ['title', 'summary', 'items']) ||
      !boundedSafeString(raw.title, 120) ||
      !boundedSafeString(raw.summary, 500) ||
      !Array.isArray(raw.items) ||
      raw.items.length > 20
    )
      return null;
    const items: Array<{ label: string; value: string }> = [];
    for (const item of raw.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      if (
        !exactKeys(row, ['label', 'value']) ||
        !boundedSafeString(row.label, 80) ||
        !boundedSafeString(row.value, 240)
      )
        return null;
      items.push({ label: row.label, value: row.value });
    }
    artifact = { title: raw.title, summary: raw.summary, items };
  }
  return {
    runKey: dto.runKey,
    workflowKey: principal.workflowKey,
    principalKey: principal.principalKey,
    status: dto.status as 'succeeded' | 'failed' | 'skipped' | 'cancelled',
    resultCode: code,
    summary: dto.summary,
    proposalKey: dto.proposalKey as string | null,
    artifact,
  };
}

export async function handleAutomationResultRequest(
  request: Request,
  deps: {
    env?: Readonly<Record<string, string | undefined>>;
    store?: AutomationStateStore;
    runtime?: AutomationRuntime;
    log?: (event: string) => void;
  } = {},
): Promise<NextResponse> {
  const env = deps.env ?? process.env;
  if (!isAutomationsResultCallbackEnabled(env))
    return response(404, {
      ok: false,
      error: { code: 'disabled', message: 'Endpoint desactivado.' },
    });
  const target = validateOpenClawRouteContract(
    { method: request.method, url: request.url },
    { method: 'POST', pathname: '/api/automations/v1/runs', body: 'json' },
  );
  if (!target.ok)
    return response(target.status, {
      ok: false,
      error: { code: target.code, message: target.message },
    });
  if (!JSON_CONTENT_TYPE_PATTERN.test(request.headers.get('content-type') ?? ''))
    return response(415, {
      ok: false,
      error: { code: 'invalid-content-type', message: 'Content-Type inválido.' },
    });
  const requestId = request.headers.get('x-vida-request-id') ?? '';
  const secret = request.headers.get(AUTOMATIONS_N8N_SECRET_HEADER) ?? '';
  const config = resolveN8nClientConfig(env);
  if (
    !config.ok ||
    !REQUEST_ID_PATTERN.test(requestId) ||
    !secretsMatch(config.value.secret, secret)
  )
    return response(401, {
      ok: false,
      error: { code: 'unauthorized', message: 'Autenticación inválida.' },
    });
  const bytes = await readOpenClawBodyBytes(request, MAX_BODY_BYTES);
  if (!bytes.ok)
    return response(bytes.reason === 'body-too-large' ? 413 : 400, {
      ok: false,
      error: { code: bytes.reason, message: 'Body inválido.' },
    });
  const decoded = decodeOpenClawUtf8(bytes.bytes);
  if (!decoded.ok)
    return response(400, { ok: false, error: { code: 'invalid-json', message: 'JSON inválido.' } });
  const json = parseOpenClawJsonStrict(decoded.text);
  if (!json.ok)
    return response(400, { ok: false, error: { code: 'invalid-json', message: 'JSON inválido.' } });
  const dto = parseAutomationResultDto(json.value);
  if (!dto)
    return response(400, {
      ok: false,
      error: { code: 'invalid-result', message: 'Resultado fuera de contrato.' },
    });
  const store = deps.store ?? buildAutomationStateStore(env);
  const runtime = deps.runtime ?? buildAutomationRuntime(env);
  if (!store || !runtime)
    return response(503, {
      ok: false,
      error: { code: 'misconfigured', message: 'Runtime no configurado.' },
    });
  const replay = await store.reserveIdempotency({
    workflowKey: dto.workflowKey,
    idempotencyKey: `callback:${requestId}`,
    runKey: dto.runKey,
    payloadDigest: createHash('sha256').update(decoded.text, 'utf8').digest('hex'),
    ttlSeconds: 24 * 60 * 60,
  });
  if (replay.status === 'conflict') {
    return response(409, {
      ok: false,
      error: { code: 'replay', message: 'Solicitud duplicada.' },
    });
  }
  if (replay.status === 'replay') {
    if (replay.runKey !== dto.runKey)
      return response(409, {
        ok: false,
        error: { code: 'replay', message: 'Solicitud duplicada.' },
      });
    const stored = await store.getRun(dto.runKey);
    if (
      !stored ||
      stored.status !== dto.status ||
      stored.resultCode !== dto.resultCode ||
      stored.proposalKey !== dto.proposalKey
    ) {
      return response(409, {
        ok: false,
        error: { code: 'replay', message: 'Solicitud duplicada o en curso.' },
      });
    }
    return response(200, { ok: true, runKey: dto.runKey, status: dto.status, replay: true });
  }
  const result = await runtime.recordResult(dto);
  if (!result.ok || !result.run)
    return response(409, {
      ok: false,
      error: { code: 'invalid-transition', message: 'Transición inválida.' },
    });
  const trace = createHash('sha256').update(dto.runKey).digest('hex').slice(0, 24);
  (deps.log ?? console.info)(
    JSON.stringify({
      scope: 'automations',
      operation: 'result',
      runTrace: trace,
      workflowKey: dto.workflowKey,
      status: dto.status,
    }),
  );
  return response(200, {
    ok: true,
    runKey: dto.runKey,
    status: result.run.status,
    replay: result.replay,
  });
}
