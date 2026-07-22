import {
  finishOpenClawError,
  finishOpenClawOk,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';
import { executeOpenClawRead } from '@/lib/openclaw/reads';
import type { OpenClawReadOperation, OpenClawReadResponse } from '@/types/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const READ_OPS = new Set<OpenClawReadOperation>([
  'system.overview',
  'areas.list',
  'areas.get',
  'tasks.list',
  'projects.list',
  'calendar.upcoming',
  'gym.summary',
  'approvals.list',
  'documents.search',
  'document.get',
]);

export async function POST(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    requireJsonBody: true,
  });
  if (!parsed.ok) return parsed.response;

  const body = parsed.value.json;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return finishOpenClawError(
      parsed.value,
      'read',
      400,
      'invalid-input',
      'Body de lectura inválido.',
    );
  }
  const record = body as Record<string, unknown>;
  const operation = typeof record.operation === 'string' ? record.operation : '';
  if (!READ_OPS.has(operation as OpenClawReadOperation)) {
    return finishOpenClawError(
      parsed.value,
      'read',
      400,
      'invalid-operation',
      'Operación de lectura no registrada.',
    );
  }

  const result = await executeOpenClawRead(operation as OpenClawReadOperation, record.input ?? {});
  if (!result.ok) {
    const status =
      result.code === 'not-found'
        ? 404
        : result.code === 'forbidden' || result.code === 'flag-disabled'
          ? 403
          : result.code === 'invalid-input'
            ? 400
            : 503;
    return finishOpenClawError(
      parsed.value,
      operation,
      status,
      result.code === 'flag-disabled'
        ? 'flag-disabled'
        : result.code === 'forbidden'
          ? 'forbidden'
          : result.code === 'not-found'
            ? 'not-found'
            : result.code === 'invalid-input'
              ? 'invalid-input'
              : 'source-unavailable',
      result.message,
      Boolean(result.retryable),
    );
  }

  const response: OpenClawReadResponse = {
    ok: true,
    requestId: parsed.value.requestId,
    generatedAt: new Date().toISOString(),
    operation: operation as OpenClawReadOperation,
    dataFreshness: result.dataFreshness,
    sources: result.sources,
    warnings: result.warnings,
    nextCursor: result.nextCursor,
    data: result.data,
  };

  return finishOpenClawOk(parsed.value, operation, response, {
    itemCount: result.itemCount,
  });
}
