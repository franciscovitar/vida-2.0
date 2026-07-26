import { NextResponse } from 'next/server';

import { getOpenClawApiConfig, isOpenClawApiEnabled } from '@/lib/openclaw/config';
import {
  finishOpenClawOk,
  OPENCLAW_SECURITY_HEADERS,
  parseAndAuthenticateOpenClawRequest,
} from '@/lib/openclaw/http';
import { OPENCLAW_API_VERSION, OPENCLAW_CAPABILITIES_VERSION } from '@/types/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const parsed = await parseAndAuthenticateOpenClawRequest(request, {
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    body: 'none',
  });
  if (!parsed.ok) return parsed.response;

  const config = getOpenClawApiConfig();
  const body = {
    ok: true as const,
    requestId: parsed.value.requestId,
    version: OPENCLAW_API_VERSION,
    enabled: isOpenClawApiEnabled(),
    accessMode: config.ok ? config.accessMode : 'disabled',
    status: 'ready' as const,
    serverTime: new Date().toISOString(),
    capabilitiesVersion: OPENCLAW_CAPABILITIES_VERSION,
  };

  return finishOpenClawOk(parsed.value, 'health', body);
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      requestId: 'unknown',
      error: { code: 'invalid-operation', message: 'Método no permitido.', retryable: false },
    },
    { status: 405, headers: OPENCLAW_SECURITY_HEADERS },
  );
}
