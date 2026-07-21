import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { resolveAllowedEmails, resolveAuthProxyDecision } from '@/lib/auth/authorize';

/**
 * Proxy Next.js 16 — protección optimista de rutas.
 * La autorización real vive en verifySession / Server Actions.
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const decision = resolveAuthProxyDecision({
    pathname,
    hasUser: Boolean(req.auth?.user),
    email: req.auth?.user?.email ?? null,
    allowedEmails: resolveAllowedEmails(process.env),
  });

  if (decision.action === 'next') {
    return NextResponse.next();
  }

  if (decision.pathname === '/login' && pathname !== '/') {
    const login = new URL('/login', req.nextUrl.origin);
    login.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.redirect(new URL(decision.pathname, req.nextUrl.origin));
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
