import { NextRequest, NextResponse } from 'next/server';

import {
  buildHuaweiConsentUrl,
  generateHuaweiOAuthState,
  huaweiOAuthStateCookieOptions,
  HUAWEI_OAUTH_STATE_COOKIE,
  isHuaweiHealthLocalProbeAllowed,
  resolveHuaweiHealthSetupConfig,
} from '@/lib/health/huawei-health-kit-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { verifySession } = await import('@/lib/auth/dal');
  const session = await verifySession();
  if (!session.ok) return new NextResponse('Unauthorized', { status: 401 });

  if (
    !isHuaweiHealthLocalProbeAllowed({
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      host: request.headers.get('host'),
    })
  ) {
    return new NextResponse('Huawei Health probe is local-only.', { status: 403 });
  }

  const setup = resolveHuaweiHealthSetupConfig(process.env);
  if (!setup.ok) {
    return new NextResponse('Missing HUAWEI_HEALTH_CLIENT_ID / CLIENT_SECRET.', { status: 400 });
  }

  const state = generateHuaweiOAuthState();
  const response = NextResponse.redirect(
    buildHuaweiConsentUrl({
      clientId: setup.config.clientId,
      redirectUri: setup.config.redirectUri,
      state,
    }),
    302,
  );
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(HUAWEI_OAUTH_STATE_COOKIE, state, huaweiOAuthStateCookieOptions());
  return response;
}
