import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPECTED_BRANCH = 'health-rhythm-readonly-drive-preview-2026-09-19';
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
} as const;

export async function GET(): Promise<NextResponse> {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return NextResponse.json(
      { ok: false, code: 'not-found' },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!email) {
    return NextResponse.json(
      { ok: false, code: 'not-configured' },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, serviceAccountEmail: email },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
