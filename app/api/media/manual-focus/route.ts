import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isEmailAuthorized, resolveAllowedEmails } from '@/lib/auth/authorize';
import { parseManualFocusRequest } from '@/lib/media/manual-focus';
import { writeManualFocusLevel, type ManualFocusWriteCode } from '@/lib/media/sheets-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusForWriteFailure(code: ManualFocusWriteCode): number {
  if (code === 'invalid-state') return 409;
  if (code === 'not-found' || code === 'conflict' || code === 'missing-header') return 409;
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

  const input = parseManualFocusRequest(body);
  if (!input) {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const result = await writeManualFocusLevel(input);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: 'manual-focus-write-failed' },
      { status: statusForWriteFailure(result.code) },
    );
  }

  return NextResponse.json({ ok: true });
}
