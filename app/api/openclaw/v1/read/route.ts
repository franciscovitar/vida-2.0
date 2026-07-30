import { isOpenClawReadAllowed } from '@/lib/openclaw/agents';
import {
  finishOpenClawError,
  finishOpenClawOk,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';
import {
  validateOpenClawReadBoundary,
  validateOpenClawSerializedResponseSize,
} from '@/lib/openclaw/read-boundary';
import { validateOpenClawReadEnvelope } from '@/lib/openclaw/read-contract';
import { executeOpenClawRead } from '@/lib/openclaw/reads';
import type { OpenClawErrorCode, OpenClawReadResponse } from '@/types/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapReadFailure(code: string): { status: number; code: OpenClawErrorCode } {
  if (code === 'invalid-operation') return { status: 400, code: 'invalid-operation' };
  if (code === 'invalid-input') return { status: 400, code: 'invalid-input' };
  if (code === 'forbidden') return { status: 403, code: 'forbidden' };
  if (code === 'flag-disabled') return { status: 403, code: 'flag-disabled' };
  if (code === 'not-found') return { status: 404, code: 'not-found' };
  if (code === 'source-unavailable') return { status: 503, code: 'source-unavailable' };
  return { status: 500, code: 'internal-error' };
}

export async function POST(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    method: 'POST',
    pathname: '/api/openclaw/v1/read',
    body: 'json',
  });
  if (!parsed.ok) return parsed.response;

  const validation = validateOpenClawReadEnvelope(parsed.value.json);
  if (!validation.ok) {
    return finishOpenClawError(parsed.value, 'read', 400, validation.code, validation.message);
  }

  if (!isOpenClawReadAllowed(parsed.value.agentId, validation.value.operation)) {
    return finishOpenClawError(
      parsed.value,
      validation.value.operation,
      403,
      'forbidden',
      'Operación no permitida para este agente.',
    );
  }

  const result = await executeOpenClawRead(validation.value, parsed.value.agentId);
  if (!result.ok) {
    const mapped = mapReadFailure(result.code);
    return finishOpenClawError(
      parsed.value,
      validation.value.operation,
      mapped.status,
      mapped.code,
      result.message,
      Boolean(result.retryable),
    );
  }

  const boundary = validateOpenClawReadBoundary({
    dataFreshness: result.dataFreshness,
    sources: result.sources,
    warnings: result.warnings,
    nextCursor: result.nextCursor,
    itemCount: result.itemCount,
    data: result.data,
  });

  if (!boundary.ok) {
    return finishOpenClawError(
      parsed.value,
      validation.value.operation,
      500,
      'internal-error',
      'La respuesta no superó la frontera de seguridad.',
    );
  }

  const response: OpenClawReadResponse = {
    ok: true,
    requestId: parsed.value.requestId,
    generatedAt: new Date().toISOString(),
    operation: validation.value.operation,
    dataFreshness: result.dataFreshness,
    sources: result.sources,
    warnings: result.warnings,
    nextCursor: result.nextCursor,
    itemCount: result.itemCount,
    data: result.data,
  };

  const sizeCheck = validateOpenClawSerializedResponseSize(response);
  if (!sizeCheck.ok) {
    return finishOpenClawError(
      parsed.value,
      validation.value.operation,
      500,
      'internal-error',
      'La respuesta no superó la frontera de seguridad.',
    );
  }

  return finishOpenClawOk(parsed.value, validation.value.operation, response, {
    itemCount: result.itemCount,
    sourceCount: result.sources.length,
    dataFreshness: result.dataFreshness,
  });
}
