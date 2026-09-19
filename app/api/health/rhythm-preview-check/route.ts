import { NextRequest, NextResponse } from 'next/server';

import { verifySession } from '@/lib/auth/dal';
import { readRhythmWindowFromDrive } from '@/lib/health/rhythm-drive-source';
import {
  buildRhythmPreviewDates,
  summarizeRhythmPreviewCheck,
} from '@/lib/health/rhythm-preview-check';
import { buildRhythmStability } from '@/lib/health/rhythm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
} as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== 'preview') {
    return json({ ok: false, code: 'not-found' }, 404);
  }

  const session = await verifySession();
  if (!session.ok) {
    return json({ ok: false, code: 'unauthorized' }, 401);
  }

  const endDay = request.nextUrl.searchParams.get('end') ?? '';
  const dates = buildRhythmPreviewDates(endDay);
  if (!dates) {
    return json({ ok: false, code: 'invalid-end-date' }, 400);
  }

  const read = await readRhythmWindowFromDrive({ dates });
  const score = buildRhythmStability(read.input);
  const summary = summarizeRhythmPreviewCheck(read, score, dates.length);

  return json(summary, summary.ok ? 200 : 503);
}
