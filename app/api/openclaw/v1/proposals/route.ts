import { isOpenClawProposalsEnabled } from '@/lib/actions/config';
import {
  finishOpenClawError,
  finishOpenClawOk,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';
import { createOpenClawProposal, parseOpenClawProposalRequest } from '@/lib/openclaw/proposals';
import type { OpenClawProposalResponse } from '@/types/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    method: 'POST',
    pathname: '/api/openclaw/v1/proposals',
    body: 'json',
  });
  if (!parsed.ok) return parsed.response;

  // Fail closed: no runtime de escrituras si las flags no están activas.
  if (!isOpenClawProposalsEnabled()) {
    return finishOpenClawError(
      parsed.value,
      'proposals.forbidden',
      403,
      'forbidden',
      'Operación bloqueada en modo read-only.',
    );
  }

  const body = parseOpenClawProposalRequest(parsed.value.json);
  if (!body.ok) {
    return finishOpenClawError(
      parsed.value,
      'proposals.create',
      400,
      'invalid-input',
      body.message,
    );
  }

  const created = await createOpenClawProposal({
    keyId: parsed.value.keyId,
    request: body.value,
    requestId: parsed.value.requestId,
  });

  if (!created.ok) {
    const status =
      created.code === 'flag-disabled'
        ? 403
        : created.code === 'policy-denied' || created.code === 'forbidden-action'
          ? 403
          : created.code === 'conflict' || created.code === 'lease-conflict'
            ? 409
            : 400;
    const errorCode =
      created.code === 'flag-disabled'
        ? 'flag-disabled'
        : created.code === 'policy-denied' || created.code === 'forbidden-action'
          ? 'forbidden'
          : created.code === 'conflict' || created.code === 'lease-conflict'
            ? 'conflict'
            : 'invalid-input';
    return finishOpenClawError(
      parsed.value,
      'proposals.create',
      status,
      errorCode,
      created.message,
    );
  }

  if (!created.proposalKey) {
    return finishOpenClawError(
      parsed.value,
      'proposals.create',
      500,
      'internal-error',
      'Propuesta sin clave opaca.',
    );
  }

  const response: OpenClawProposalResponse = {
    ok: true,
    requestId: parsed.value.requestId,
    generatedAt: new Date().toISOString(),
    proposalKey: created.proposalKey,
    status: 'pending',
    operation: body.value.operation,
    replay: created.replay,
    summary: created.summary,
    risk: created.risk,
    expiresAt: created.expiresAt,
    diff: created.diff,
  };

  return finishOpenClawOk(parsed.value, 'proposals.create', response, { itemCount: 1 });
}
