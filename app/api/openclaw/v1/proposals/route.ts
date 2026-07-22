import { createOpenClawProposal, parseOpenClawProposalRequest } from '@/lib/openclaw/proposals';
import {
  finishOpenClawError,
  finishOpenClawOk,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';
import type { OpenClawErrorCode, OpenClawProposalResponse } from '@/types/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    requireJsonBody: true,
  });
  if (!parsed.ok) return parsed.response;

  const validated = parseOpenClawProposalRequest(parsed.value.json);
  if (!validated.ok) {
    return finishOpenClawError(
      parsed.value,
      'proposals.create',
      400,
      'invalid-input',
      validated.message,
    );
  }

  const created = await createOpenClawProposal({
    actorId: parsed.value.actorId,
    request: validated.value,
    requestId: parsed.value.requestId,
  });

  if (!created.ok) {
    const code: OpenClawErrorCode =
      created.code === 'flag-disabled'
        ? 'flag-disabled'
        : created.code === 'conflict'
          ? 'conflict'
          : created.code === 'invalid-payload'
            ? 'invalid-input'
            : 'source-unavailable';
    return finishOpenClawError(
      parsed.value,
      validated.value.operation,
      created.code === 'flag-disabled' ? 403 : 400,
      code,
      created.message,
    );
  }

  const body: OpenClawProposalResponse = {
    ok: true,
    requestId: parsed.value.requestId,
    generatedAt: new Date().toISOString(),
    proposalKey: created.proposalKey,
    status: 'pending',
    operation: validated.value.operation,
    replay: created.replay,
    summary: created.summary,
  };

  return finishOpenClawOk(parsed.value, validated.value.operation, body, {
    proposalCreated: !created.replay,
    itemCount: 1,
  });
}
