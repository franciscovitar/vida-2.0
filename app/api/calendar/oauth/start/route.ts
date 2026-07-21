/**
 * Inicio del consentimiento OAuth Calendar (solo desarrollo local).
 */
import { NextRequest, NextResponse } from 'next/server';

import { getCalendarOAuthSetupConfig } from '@/lib/calendar/config';
import {
  buildCalendarConsentUrl,
  buildOAuthErrorHtml,
  calendarOAuthStateCookieOptions,
  CALENDAR_OAUTH_STATE_COOKIE,
  generateOAuthState,
  isCalendarOAuthAllowed,
  NO_STORE_HEADERS,
  oauthErrorPageMessage,
} from '@/lib/calendar/oauth-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

export async function GET(request: NextRequest) {
  const { verifySession } = await import('@/lib/auth/dal');
  const session = await verifySession();
  if (!session.ok) {
    return htmlResponse(
      buildOAuthErrorHtml('Sin sesión', 'Iniciá sesión en Vida 2.0 antes de conectar Calendar.'),
      401,
    );
  }

  const guard = isCalendarOAuthAllowed({
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    host: request.headers.get('host'),
  });
  if (!guard.ok) {
    return htmlResponse(
      buildOAuthErrorHtml('No disponible', oauthErrorPageMessage('forbidden')),
      403,
    );
  }

  const setup = getCalendarOAuthSetupConfig();
  if (!setup.ok) {
    return htmlResponse(
      buildOAuthErrorHtml('Sin configuración', oauthErrorPageMessage('not-configured')),
      400,
    );
  }

  const state = generateOAuthState();
  const authUrl = buildCalendarConsentUrl({
    clientId: setup.config.clientId,
    redirectUri: setup.config.redirectUri,
    state,
  });

  const response = NextResponse.redirect(authUrl, 302);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(key, value);
  }
  response.cookies.set(CALENDAR_OAUTH_STATE_COOKIE, state, calendarOAuthStateCookieOptions());
  return response;
}
