import { NextRequest, NextResponse } from 'next/server';

import {
  isHuaweiHealthLocalProbeAllowed,
  resolveHuaweiHealthRuntimeConfig,
  summarizeHuaweiHrvSamples,
} from '@/lib/health/huawei-health-kit-core';
import { probeHuaweiHrv } from '@/lib/health/huawei-health-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { verifySession } = await import('@/lib/auth/dal');
  const session = await verifySession();
  if (!session.ok) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  if (
    !isHuaweiHealthLocalProbeAllowed({
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      host: request.headers.get('host'),
    })
  ) {
    return NextResponse.json({ ok: false, reason: 'local-only' }, { status: 403 });
  }

  const config = resolveHuaweiHealthRuntimeConfig(process.env);
  if (!config.ok) {
    return NextResponse.json({ ok: false, reason: 'not-configured' }, { status: 400 });
  }

  const rawDays = Number(request.nextUrl.searchParams.get('days') ?? '7');
  const days = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 7 ? rawDays : 7;
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  const result = await probeHuaweiHrv({
    config: config.config,
    startTime,
    endTime,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.reason === 'permission-error' ? 403 : 502 });
  }

  const summary = summarizeHuaweiHrvSamples(result.samples);
  return NextResponse.json(
    {
      ok: true,
      dataType: 'com.huawei.heart_rate_variability',
      windowDays: days,
      apiHost: result.apiHost,
      ...summary,
      note: summary.available
        ? 'HRV RMSSD samples are available from Huawei Health Kit.'
        : 'No HRV RMSSD samples were returned in this window.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
