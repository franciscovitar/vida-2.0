import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isEmailAuthorized, resolveAllowedEmails } from '@/lib/auth/authorize';
import { parseSeriesSeasonRatingRequest } from '@/lib/media/season-rating';
import {
  writeSeriesSeasonRating,
  type SeriesSeasonRatingWriteCode,
} from '@/lib/media/season-rating-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusForWriteFailure(code: SeriesSeasonRatingWriteCode): number {
  if (
    code === 'not-found' ||
    code === 'conflict' ||
    code === 'missing-header' ||
    code === 'invalid-season'
  ) {
    return 409;
  }
  if (code === 'disabled' || code === 'not-configured') return 503;
  if (code === 'auth-error' || code === 'permission-error') return 503;
  return 500;
}

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }
  if (!isEmailAuthorized(email, resolveAllowedEmails(process.env))) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const input = parseSeriesSeasonRatingRequest(body);
  if (!input) {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const result = await writeSeriesSeasonRating(input);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: 'series-season-rating-write-failed' },
      { status: statusForWriteFailure(result.code) },
    );
  }

  return NextResponse.json({ ok: true });
}
