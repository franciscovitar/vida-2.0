import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';
import { getOpenClawApiConfig } from '@/lib/openclaw/config';
import { finishOpenClawOk, parseAndAuthenticateOpenClawRequest } from '@/lib/openclaw/http';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import { OPENCLAW_CAPABILITIES_VERSION, type OpenClawReadOperation } from '@/types/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    method: 'GET',
    pathname: '/api/openclaw/v1/capabilities',
    body: 'none',
  });
  if (!parsed.ok) return parsed.response;

  const config = getOpenClawApiConfig();
  const readiness = getOpenClawReadiness();
  const capabilities = listOpenClawCapabilities();
  const reads = capabilities
    .filter((item) => item.kind === 'read')
    .map((item) => ({
      ...item,
      availability: readiness.readers[item.id as OpenClawReadOperation],
    }));

  return finishOpenClawOk(
    parsed.value,
    'capabilities',
    {
      ok: true,
      requestId: parsed.value.requestId,
      capabilitiesVersion: OPENCLAW_CAPABILITIES_VERSION,
      accessMode: config.ok ? config.accessMode : 'disabled',
      readiness,
      read: reads,
      proposal: capabilities.filter((item) => item.kind === 'proposal'),
      forbidden: capabilities.filter((item) => item.kind === 'forbidden'),
    },
    { itemCount: capabilities.length },
  );
}
