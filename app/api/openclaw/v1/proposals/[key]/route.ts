import { isOpenClawProposalsEnabled } from '@/lib/actions/config';
import {
  finishOpenClawError,
  finishOpenClawOk,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';
import {
  getOpenClawProposal,
  isOpenClawProposalOwnedByAgent,
  toOpenClawProposalMetadata,
} from '@/lib/openclaw/proposals';
import type { OpenClawProposalGetResponse } from '@/types/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    method: 'GET',
    pathname: /^\/api\/openclaw\/v1\/proposals\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    body: 'none',
  });
  if (!parsed.ok) return parsed.response;

  if (!isOpenClawProposalsEnabled()) {
    return finishOpenClawError(
      parsed.value,
      'proposals.forbidden',
      403,
      'forbidden',
      'Operación bloqueada en modo read-only.',
    );
  }

  const { key: rawKey } = await context.params;
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!KEY_PATTERN.test(key)) {
    return finishOpenClawError(
      parsed.value,
      'proposals.get',
      400,
      'invalid-input',
      'Clave de propuesta inválida.',
    );
  }

  const proposal = await getOpenClawProposal(key);
  if (!proposal || !isOpenClawProposalOwnedByAgent(proposal, parsed.value.agentId)) {
    return finishOpenClawError(
      parsed.value,
      'proposals.get',
      404,
      'not-found',
      'Propuesta no encontrada.',
    );
  }

  const meta = toOpenClawProposalMetadata(proposal);
  const response: OpenClawProposalGetResponse = {
    ok: true,
    requestId: parsed.value.requestId,
    generatedAt: new Date().toISOString(),
    ...meta,
  };

  return finishOpenClawOk(parsed.value, 'proposals.get', response, { itemCount: 1 });
}
