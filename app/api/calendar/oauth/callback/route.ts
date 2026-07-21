/**
 * Callback OAuth Calendar (solo desarrollo local).
 * Muestra el refresh_token una sola vez en HTML; no lo guarda ni lo registra.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getCalendarOAuthSetupConfig } from '@/lib/calendar/config';
import { exchangeCalendarAuthorizationCode } from '@/lib/calendar/oauth-exchange';
import {
  buildOAuthErrorHtml,
  buildOAuthSuccessHtml,
  calendarOAuthStateCookieOptions,
  CALENDAR_OAUTH_STATE_COOKIE,
  isCalendarOAuthAllowed,
  NO_STORE_HEADERS,
  noRefreshTokenMessage,
  oauthErrorPageMessage,
  validateOAuthCallback,
} from '@/lib/calendar/oauth-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(CALENDAR_OAUTH_STATE_COOKIE, '', {
    ...calendarOAuthStateCookieOptions(0),
    maxAge: 0,
  });
}

function htmlResponse(body: string, status = 200): NextResponse {
  const response = new NextResponse(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
  clearStateCookie(response);
  return response;
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

  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');
  const cookieState = request.cookies.get(CALENDAR_OAUTH_STATE_COOKIE)?.value ?? null;

  const validated = validateOAuthCallback({
    code,
    state,
    cookieState,
    googleError,
  });

  if (!validated.ok) {
    return htmlResponse(
      buildOAuthErrorHtml('Autorización fallida', oauthErrorPageMessage(validated.reason)),
      400,
    );
  }

  const setup = getCalendarOAuthSetupConfig();
  if (!setup.ok) {
    return htmlResponse(
      buildOAuthErrorHtml('Sin configuración', oauthErrorPageMessage('not-configured')),
      400,
    );
  }

  const exchanged = await exchangeCalendarAuthorizationCode(setup.config, validated.code);
  if (!exchanged.ok) {
    if (exchanged.reason === 'no-refresh-token') {
      return htmlResponse(buildOAuthErrorHtml('Sin refresh token', noRefreshTokenMessage()), 400);
    }
    return htmlResponse(
      buildOAuthErrorHtml(
        'Intercambio fallido',
        'No se pudo completar el intercambio del código. Volvé a iniciar el flujo.',
      ),
      400,
    );
  }

  return htmlResponse(buildOAuthSuccessHtml(exchanged.refreshToken), 200);
}
