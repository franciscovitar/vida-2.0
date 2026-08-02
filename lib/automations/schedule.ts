import { NextResponse } from 'next/server';

import {
  areAutomationTemplatesProvisioned,
  isAutomationsScheduleIngressEnabled,
} from '@/lib/automations/config';
import {
  getAutomationPrincipalContract,
  getAutomationWorkflowContract,
  isAutomationPrincipalKey,
} from '@/lib/automations/contracts';
import {
  automationPrincipalTrace,
  buildAutomationLogEvent,
  emitAutomationLog,
} from '@/lib/automations/observability';
import { buildScheduledAutomationRuntime, type AutomationRuntime } from '@/lib/automations/runtime';
import { sha256Hex, verifyOpenClawRequest } from '@/lib/openclaw/auth';
import {
  decodeOpenClawUtf8,
  parseOpenClawJsonStrict,
  readOpenClawBodyBytes,
} from '@/lib/openclaw/body';
import { OPENCLAW_REPLAY_TTL_SECONDS } from '@/lib/openclaw/config';
import { OPENCLAW_SECURITY_HEADERS } from '@/lib/openclaw/http';
import {
  resolveOpenClawRateLimitPort,
  type OpenClawRateLimitPort,
} from '@/lib/openclaw/rate-limit';
import { resolveOpenClawReplayPort, type OpenClawReplayPort } from '@/lib/openclaw/replay';
import { validateOpenClawRouteContract } from '@/lib/openclaw/route-contract';
import {
  AUTOMATION_CONTRACT_VERSION,
  AUTOMATION_WORKFLOW_KEYS,
  type AutomationWorkflowKey,
} from '@/types/automations';

const PATHNAME = '/api/automations/v1/triggers/scheduled';
const MAX_BODY_BYTES = 2 * 1024;
const OCCURRENCE_WINDOW_MS = 15 * 60 * 1000;
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

type ScheduleDto = {
  workflowKey: AutomationWorkflowKey;
  scheduledFor: string;
  contractVersion: typeof AUTOMATION_CONTRACT_VERSION;
};

function response(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status, headers: OPENCLAW_SECURITY_HEADERS });
}

function error(status: number, code: string, message: string, retryable = false): NextResponse {
  return response(status, { ok: false, error: { code, message, retryable } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDto(value: unknown): ScheduleDto | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== 'contractVersion' ||
    keys[1] !== 'scheduledFor' ||
    keys[2] !== 'workflowKey' ||
    typeof value.workflowKey !== 'string' ||
    !(AUTOMATION_WORKFLOW_KEYS as readonly string[]).includes(value.workflowKey) ||
    typeof value.scheduledFor !== 'string' ||
    value.contractVersion !== AUTOMATION_CONTRACT_VERSION
  )
    return null;
  return value as ScheduleDto;
}

function localOccurrenceParts(instant: Date): {
  weekday: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Cordoba',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return { weekday: part('weekday'), hour: Number(part('hour')), minute: Number(part('minute')) };
}

export function isCanonicalScheduledOccurrence(
  workflowKey: AutomationWorkflowKey,
  scheduledFor: string,
  nowMs: number,
): boolean {
  const scheduledMs = Date.parse(scheduledFor);
  if (
    !Number.isFinite(scheduledMs) ||
    new Date(scheduledMs).toISOString() !== scheduledFor ||
    new Date(scheduledMs).getUTCSeconds() !== 0 ||
    new Date(scheduledMs).getUTCMilliseconds() !== 0 ||
    Math.abs(nowMs - scheduledMs) > OCCURRENCE_WINDOW_MS
  )
    return false;
  const { weekday, hour, minute } = localOccurrenceParts(new Date(scheduledMs));
  switch (workflowKey) {
    case 'daily-briefing':
      return hour === 7 && minute === 15;
    case 'technical-watchdog':
      return minute === 17;
    case 'weekly-review':
      return weekday === 'Sun' && hour === 18 && minute === 10;
    case 'approval-digest':
      return (hour === 12 || hour === 19) && minute === 15;
    case 'planning-suggestion':
      return !['Sat', 'Sun'].includes(weekday) && hour === 7 && minute === 30;
  }
}

export async function handleScheduledAutomationRequest(
  request: Request,
  deps: {
    env?: Readonly<Record<string, string | undefined>>;
    runtime?: AutomationRuntime;
    rateLimit?: OpenClawRateLimitPort;
    replay?: OpenClawReplayPort;
    now?: () => number;
    log?: (event: string) => void;
  } = {},
): Promise<NextResponse> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const startedAt = now();
  if (!isAutomationsScheduleIngressEnabled(env))
    return error(404, 'disabled', 'Endpoint desactivado.');
  if (!areAutomationTemplatesProvisioned(env))
    return error(503, 'misconfigured', 'Runtime no configurado.', true);

  const target = validateOpenClawRouteContract(
    { method: request.method, url: request.url },
    { method: 'POST', pathname: PATHNAME, body: 'json' },
  );
  if (!target.ok) return error(target.status, target.code, target.message);
  if (!JSON_CONTENT_TYPE_PATTERN.test(request.headers.get('content-type') ?? ''))
    return error(415, 'invalid-content-type', 'Content-Type application/json requerido.');

  const read = await readOpenClawBodyBytes(request, MAX_BODY_BYTES);
  if (!read.ok)
    return error(
      read.reason === 'body-too-large' ? 413 : 400,
      read.reason,
      read.reason === 'body-too-large' ? 'Body demasiado grande.' : 'Body no legible.',
    );
  const auth = verifyOpenClawRequest({
    env,
    method: target.method,
    pathname: target.pathname,
    rawBody: read.bytes,
    keyIdHeader: request.headers.get('x-vida-key-id'),
    timestampHeader: request.headers.get('x-vida-timestamp'),
    signatureHeader: request.headers.get('x-vida-signature'),
    requestIdHeader: request.headers.get('x-vida-request-id'),
    nowMs: startedAt,
  });
  if (
    !auth.ok ||
    !auth.workflowPrincipalKey ||
    !isAutomationPrincipalKey(auth.workflowPrincipalKey)
  )
    return error(401, 'unauthorized', 'Autenticación inválida.');

  const principalKey = auth.workflowPrincipalKey;
  const principal = getAutomationPrincipalContract(principalKey);
  const contract = getAutomationWorkflowContract(principal.workflowKey);
  const rate = await (deps.rateLimit ?? resolveOpenClawRateLimitPort(env)).allow(
    auth.principalId,
    contract.ratePerMinute,
    startedAt,
  );
  if (!rate.ok)
    return rate.reason === 'rate-limited'
      ? error(429, 'rate-limited', 'Límite de tasa excedido.', true)
      : error(503, 'security-control-unavailable', 'Control de seguridad no disponible.', true);
  const replay = await (deps.replay ?? resolveOpenClawReplayPort(env)).reserve(
    auth.replayKeys,
    OPENCLAW_REPLAY_TTL_SECONDS,
    startedAt,
  );
  if (!replay.ok)
    return replay.reason === 'replay-detected'
      ? error(409, 'replay-detected', 'Solicitud duplicada.')
      : error(503, 'security-control-unavailable', 'Control de seguridad no disponible.', true);

  const decoded = decodeOpenClawUtf8(read.bytes);
  if (!decoded.ok) return error(400, 'invalid-json', 'JSON inválido.');
  const parsed = parseOpenClawJsonStrict(decoded.text);
  if (!parsed.ok) return error(400, 'invalid-json', 'JSON inválido.');
  const dto = parseDto(parsed.value);
  if (
    !dto ||
    dto.workflowKey !== auth.workflowKey ||
    dto.workflowKey !== contract.workflowKey ||
    !isCanonicalScheduledOccurrence(dto.workflowKey, dto.scheduledFor, startedAt)
  )
    return error(400, 'invalid-input', 'Solicitud fuera del contrato.');

  const runtime = deps.runtime ?? buildScheduledAutomationRuntime(env);
  if (!runtime) return error(503, 'misconfigured', 'Runtime no configurado.', true);
  try {
    const begun = await runtime.beginScheduledRun({
      workflowKey: dto.workflowKey,
      principalKey,
      scheduledFor: dto.scheduledFor,
      contractVersion: dto.contractVersion,
      payloadDigest: sha256Hex(read.bytes),
    });
    if (!begun.ok || !begun.run) {
      const status =
        begun.code === 'busy'
          ? 409
          : begun.code === 'paused'
            ? 423
            : begun.code === 'disabled'
              ? 404
              : begun.code === 'invalid-input'
                ? 409
                : 503;
      return error(status, begun.code, begun.message, status >= 500);
    }
    emitAutomationLog(
      buildAutomationLogEvent({
        workflowKey: begun.run.workflowKey,
        principalKey: begun.run.principalKey,
        runKey: begun.run.runKey,
        operation: 'schedule.begin',
        status: begun.run.status,
        attempt: begun.run.attempt,
        durationMs: now() - startedAt,
        resultCode: begun.run.resultCode,
      }),
      deps.log,
    );
    return response(200, {
      ok: true,
      accepted: begun.code === 'accepted',
      replay: begun.code === 'replay',
      runKey: begun.run.runKey,
      workflowKey: begun.run.workflowKey,
      principalTrace: automationPrincipalTrace(begun.run.principalKey),
      status: begun.run.status,
      attempt: begun.run.attempt,
      contractVersion: AUTOMATION_CONTRACT_VERSION,
    });
  } catch {
    return error(503, 'temporarily-unavailable', 'Servicio temporalmente no disponible.', true);
  }
}
