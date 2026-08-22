import { createHash, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import {
  areAutomationTemplatesProvisioned,
  isAutomationsApiEnabled,
  isAutomationsManualRunEnabled,
  isAutomationWorkflowEnabled,
} from '@/lib/automations/config';
import {
  getAutomationPrincipalContract,
  getAutomationWorkflowContract,
  isAutomationPrincipalKey,
} from '@/lib/automations/contracts';
import {
  AUTOMATIONS_N8N_SECRET_HEADER,
  N8N_MANUAL_WORKFLOW_KEYS,
  resolveN8nClientConfig,
} from '@/lib/automations/n8n-client';
import { buildAutomationStateStore, type AutomationStateStore } from '@/lib/automations/store';
import {
  decodeOpenClawUtf8,
  parseOpenClawJsonStrict,
  readOpenClawBodyBytes,
} from '@/lib/openclaw/body';
import { validateOpenClawRouteContract } from '@/lib/openclaw/route-contract';
import { AUTOMATION_CONTRACT_VERSION, type AutomationWorkflowKey } from '@/types/automations';

const PATHNAME = '/api/automations/v1/deliveries/claim';
const MAX_BODY_BYTES = 4 * 1024;
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const OPAQUE_RUN_PATTERN = /^run_[A-Za-z0-9_-]{20,80}$/;
const REQUEST_KEY_PATTERN = /^request_[A-Za-z0-9_-]{24}$/;
const MANUAL_IDEMPOTENCY_PATTERN =
  /^manual:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

type ManualDeliveryClaimDto = {
  runKey: string;
  workflowKey: AutomationWorkflowKey;
  principalKey: string;
  idempotencyKey: string;
  requestKey: string;
  attempt: number;
  trigger: 'manual' | 'retry';
  contractVersion: typeof AUTOMATION_CONTRACT_VERSION;
};

function response(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function secretsMatch(expected: string, provided: string): boolean {
  const left = createHash('sha256').update(expected, 'utf8').digest();
  const right = createHash('sha256').update(provided, 'utf8').digest();
  return timingSafeEqual(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseManualDeliveryClaimDto(value: unknown): ManualDeliveryClaimDto | null {
  if (!isRecord(value)) return null;
  const expected = [
    'attempt',
    'contractVersion',
    'idempotencyKey',
    'principalKey',
    'requestKey',
    'runKey',
    'trigger',
    'workflowKey',
  ];
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index]))
    return null;
  if (typeof value.runKey !== 'string' || !OPAQUE_RUN_PATTERN.test(value.runKey)) return null;
  if (
    typeof value.workflowKey !== 'string' ||
    !(N8N_MANUAL_WORKFLOW_KEYS as readonly string[]).includes(value.workflowKey)
  )
    return null;
  if (typeof value.principalKey !== 'string' || !isAutomationPrincipalKey(value.principalKey))
    return null;
  const principal = getAutomationPrincipalContract(value.principalKey);
  if (principal.workflowKey !== value.workflowKey) return null;
  if (
    typeof value.idempotencyKey !== 'string' ||
    !MANUAL_IDEMPOTENCY_PATTERN.test(value.idempotencyKey) ||
    typeof value.requestKey !== 'string' ||
    !REQUEST_KEY_PATTERN.test(value.requestKey) ||
    !Number.isInteger(value.attempt) ||
    (value.attempt as number) < 1 ||
    (value.attempt as number) > 3 ||
    value.trigger !== ((value.attempt as number) === 1 ? 'manual' : 'retry') ||
    value.contractVersion !== AUTOMATION_CONTRACT_VERSION
  )
    return null;
  return value as ManualDeliveryClaimDto;
}

function claimDigest(dto: ManualDeliveryClaimDto): string {
  return createHash('sha256')
    .update([dto.requestKey, String(dto.attempt), dto.trigger].join('\n'), 'utf8')
    .digest('hex');
}

export async function handleManualDeliveryClaimRequest(
  request: Request,
  deps: {
    env?: Readonly<Record<string, string | undefined>>;
    store?: AutomationStateStore;
  } = {},
): Promise<NextResponse> {
  const env = deps.env ?? process.env;
  if (
    !isAutomationsApiEnabled(env) ||
    !isAutomationsManualRunEnabled(env) ||
    !areAutomationTemplatesProvisioned(env)
  )
    return response(404, {
      ok: false,
      error: { code: 'disabled', message: 'Endpoint desactivado.' },
    });

  const target = validateOpenClawRouteContract(
    { method: request.method, url: request.url },
    { method: 'POST', pathname: PATHNAME, body: 'json' },
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

  const bytes = await readOpenClawBodyBytes(request, MAX_BODY_BYTES);
  if (!bytes.ok)
    return response(bytes.reason === 'body-too-large' ? 413 : 400, {
      ok: false,
      error: { code: bytes.reason, message: 'Body inválido.' },
    });
  const decoded = decodeOpenClawUtf8(bytes.bytes);
  if (!decoded.ok)
    return response(400, {
      ok: false,
      error: { code: 'invalid-json', message: 'JSON inválido.' },
    });
  const parsed = parseOpenClawJsonStrict(decoded.text);
  if (!parsed.ok)
    return response(400, {
      ok: false,
      error: { code: 'invalid-json', message: 'JSON inválido.' },
    });
  const dto = parseManualDeliveryClaimDto(parsed.value);
  if (!dto)
    return response(400, {
      ok: false,
      error: { code: 'invalid-input', message: 'Solicitud fuera del contrato.' },
    });

  const secret = request.headers.get(AUTOMATIONS_N8N_SECRET_HEADER) ?? '';
  const requestId = request.headers.get('x-vida-request-id') ?? '';
  const config = resolveN8nClientConfig(env);
  if (
    !config.ok ||
    !secretsMatch(config.value.secret, secret) ||
    requestId !== `claim:${dto.requestKey}`
  )
    return response(401, {
      ok: false,
      error: { code: 'unauthorized', message: 'Autenticación inválida.' },
    });
  if (!isAutomationWorkflowEnabled(dto.workflowKey, env))
    return response(404, {
      ok: false,
      error: { code: 'disabled', message: 'Workflow desactivado.' },
    });

  const store = deps.store ?? buildAutomationStateStore(env);
  if (!store)
    return response(503, {
      ok: false,
      error: { code: 'misconfigured', message: 'Store no configurado.' },
    });

  try {
    const run = await store.getRun(dto.runKey);
    if (
      !run ||
      run.workflowKey !== dto.workflowKey ||
      run.principalKey !== dto.principalKey ||
      run.idempotencyKey !== dto.idempotencyKey ||
      run.status !== 'running'
    )
      return response(409, {
        ok: false,
        error: { code: 'invalid-transition', message: 'Ejecución fuera de estado.' },
      });

    const contract = getAutomationWorkflowContract(dto.workflowKey);
    const claim = await store.reserveIdempotency({
      workflowKey: dto.workflowKey,
      idempotencyKey: `delivery:${dto.runKey}`,
      runKey: dto.runKey,
      payloadDigest: claimDigest(dto),
      ttlSeconds: contract.retentionSeconds,
    });
    const shouldExecute = claim.status !== 'conflict';
    return response(200, {
      ok: true,
      shouldExecute,
      runKey: dto.runKey,
      requestKey: dto.requestKey,
    });
  } catch {
    return response(503, {
      ok: false,
      error: { code: 'temporarily-unavailable', message: 'Servicio temporalmente no disponible.' },
    });
  }
}
