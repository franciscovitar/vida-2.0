import {
  executeOpenClawTelegramInboxDirect,
  isOpenClawTelegramInboxDirectEnabled,
  parseOpenClawTelegramInboxDirectRequest,
} from '@/lib/openclaw/direct-inbox';
import {
  finishOpenClawError,
  finishOpenClawOk,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    method: 'POST',
    pathname: '/api/openclaw/v1/direct/inbox',
    body: 'json',
  });
  if (!parsed.ok) return parsed.response;

  if (!isOpenClawTelegramInboxDirectEnabled()) {
    return finishOpenClawError(
      parsed.value,
      'inbox.capture.direct',
      403,
      'flag-disabled',
      'Captura directa Telegram desactivada.',
    );
  }

  if (
    parsed.value.agentId !== 'steward' ||
    parsed.value.workflowPrincipalKey !== null ||
    parsed.value.workflowKey !== null
  ) {
    return finishOpenClawError(
      parsed.value,
      'inbox.capture.direct',
      403,
      'forbidden',
      'Operación no permitida para este principal.',
    );
  }

  const body = parseOpenClawTelegramInboxDirectRequest(parsed.value.json);
  if (!body.ok) {
    return finishOpenClawError(
      parsed.value,
      'inbox.capture.direct',
      400,
      'invalid-input',
      body.message,
    );
  }

  const result = await executeOpenClawTelegramInboxDirect(body.value);
  if (!result.ok) {
    const status =
      result.code === 'flag-disabled' || result.code === 'policy-denied'
        ? 403
        : result.code === 'conflict' || result.code === 'in-progress'
          ? 409
          : result.code === 'not-configured' || result.code === 'misconfigured'
            ? 503
            : 400;
    const errorCode =
      result.code === 'flag-disabled'
        ? 'flag-disabled'
        : result.code === 'policy-denied'
          ? 'forbidden'
          : result.code === 'conflict' || result.code === 'in-progress'
            ? 'conflict'
            : result.code === 'not-configured' || result.code === 'misconfigured'
              ? 'source-unavailable'
              : 'invalid-input';
    return finishOpenClawError(
      parsed.value,
      'inbox.capture.direct',
      status,
      errorCode,
      result.message,
      status === 503,
    );
  }

  return finishOpenClawOk(
    parsed.value,
    'inbox.capture.direct',
    {
      ok: true,
      requestId: parsed.value.requestId,
      generatedAt: new Date().toISOString(),
      operation: 'inbox.capture.direct',
      replay: result.replay,
      verified: result.verified,
    },
    { itemCount: 1 },
  );
}
