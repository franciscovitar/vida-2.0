import { getOpenClawProposal } from '@/lib/openclaw/proposals';
import {
  finishOpenClawError,
  finishOpenClawOk,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: RouteContext) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    requireJsonBody: false,
  });
  if (!parsed.ok) return parsed.response;

  const { key } = await context.params;
  const proposalKey = decodeURIComponent(key ?? '').trim();
  if (!proposalKey) {
    return finishOpenClawError(
      parsed.value,
      'proposals.get',
      400,
      'invalid-input',
      'Clave de propuesta requerida.',
    );
  }

  const proposal = await getOpenClawProposal(proposalKey);
  if (!proposal) {
    return finishOpenClawError(
      parsed.value,
      'proposals.get',
      404,
      'not-found',
      'Propuesta no encontrada.',
    );
  }

  return finishOpenClawOk(
    parsed.value,
    'proposals.get',
    {
      ok: true,
      requestId: parsed.value.requestId,
      generatedAt: new Date().toISOString(),
      proposal: {
        key: proposal.key,
        name: proposal.name,
        actionType: proposal.actionType,
        status: proposal.status,
        risk: proposal.risk,
        reversible: proposal.reversible,
        reason: proposal.reason,
        expectedChange: proposal.expectedChange,
        createdAt: proposal.createdAt,
        decidedAt: proposal.decidedAt,
        resultCode: proposal.resultCode,
      },
    },
    { itemCount: 1 },
  );
}
