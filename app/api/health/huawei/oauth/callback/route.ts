import { NextRequest, NextResponse } from 'next/server';

import {
  huaweiOAuthStateCookieOptions,
  HUAWEI_OAUTH_STATE_COOKIE,
  isHuaweiHealthLocalProbeAllowed,
  resolveHuaweiHealthSetupConfig,
  safeEqualStrings,
} from '@/lib/health/huawei-health-kit-core';
import { exchangeHuaweiAuthorizationCode } from '@/lib/health/huawei-health-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(body: string, status = 200) {
  const response = new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
  response.cookies.set(HUAWEI_OAUTH_STATE_COOKIE, '', {
    ...huaweiOAuthStateCookieOptions(0),
    maxAge: 0,
  });
  return response;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: NextRequest) {
  const { verifySession } = await import('@/lib/auth/dal');
  const session = await verifySession();
  if (!session.ok) return html('<h1>Unauthorized</h1>', 401);

  if (
    !isHuaweiHealthLocalProbeAllowed({
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      host: request.headers.get('host'),
    })
  ) {
    return html('<h1>Local-only probe</h1>', 403);
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get(HUAWEI_OAUTH_STATE_COOKIE)?.value ?? null;
  if (!code || !state || !cookieState || !safeEqualStrings(state, cookieState)) {
    return html('<h1>Invalid OAuth callback</h1>', 400);
  }

  const setup = resolveHuaweiHealthSetupConfig(process.env);
  if (!setup.ok) return html('<h1>Huawei setup missing</h1>', 400);

  const exchanged = await exchangeHuaweiAuthorizationCode(setup.config, code);
  if (!exchanged.ok) {
    return html(`<h1>Token exchange failed</h1><p>${escapeHtml(exchanged.reason)}</p>`, 400);
  }

  const token = escapeHtml(exchanged.refreshToken);
  return html(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Huawei Health token</title><body style="font-family:system-ui;max-width:760px;margin:40px auto;padding:0 20px"><h1>Autorización lista</h1><p>Copiá este valor a <code>HUAWEI_HEALTH_REFRESH_TOKEN</code> en <code>.env.local</code>. No lo pegues en chats, capturas ni commits.</p><pre style="white-space:pre-wrap;word-break:break-all;border:1px solid #ccc;padding:12px">${token}</pre><p>Después reiniciá <code>npm run dev</code> y abrí <code>/api/health/huawei/hrv-probe?days=7</code>.</p></body></html>`);
}
