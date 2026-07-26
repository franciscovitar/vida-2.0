import { finishOpenClawError, parseAndAuthenticateOpenClawRequest } from '@/lib/openclaw/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    requireJsonBody: true,
  });
  if (!parsed.ok) return parsed.response;

  return finishOpenClawError(
    parsed.value,
    'proposals.forbidden',
    403,
    'forbidden',
    'Operación bloqueada en modo read-only.',
  );
}
