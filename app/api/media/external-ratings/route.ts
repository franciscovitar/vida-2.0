import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isEmailAuthorized, resolveAllowedEmails } from '@/lib/auth/authorize';
import {
  loadExternalRatings,
  type ExternalRatingsFetchCode,
} from '@/lib/media/external-ratings-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusForFailure(code: ExternalRatingsFetchCode): number {
  if (code === 'invalid-key') return 400;
  if (code === 'not-found' || code === 'provider-not-found') return 404;
  if (code === 'conflict' || code === 'missing-header' || code === 'missing-identity') return 409;
  if (code === 'not-configured' || code === 'sheet-unavailable') return 503;
  if (code === 'provider-auth' || code === 'provider-limit') return 503;
  return 502;
}

export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }
  if (!isEmailAuthorized(email, resolveAllowedEmails(process.env))) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const key = new URL(request.url).searchParams.get('key') ?? '';
  const result = await loadExternalRatings(key);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: 'external-ratings-unavailable', code: result.code },
      { status: statusForFailure(result.code) },
    );
  }

  return NextResponse.json({ ok: true, data: result.data });
}
