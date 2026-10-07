import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/auth/dal';
import { getPersonalShoppingRuntime } from '@/lib/personal-shopping/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = Record<string, unknown>;

function isRecord(value: unknown): value is RequestBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function operationIdFrom(body: RequestBody): string | null {
  if (typeof body.operationId !== 'string') return null;
  const value = body.operationId.trim();
  return value.length >= 8 && value.length <= 120 ? value : null;
}

function authStatus(reason: string): number {
  return reason === 'email-not-allowed' || reason === 'email-unverified' ? 403 : 401;
}

export async function GET() {
  const access = await verifySession();
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.reason }, { status: authStatus(access.reason) });
  }

  const shopping = getPersonalShoppingRuntime();
  if (shopping.state !== 'ready') {
    return NextResponse.json(
      { ok: false, error: shopping.state, message: shopping.notice },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json({
      ok: true,
      snapshot: await shopping.service.snapshot(),
      writesEnabled: shopping.writesEnabled,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'storage-error', message: 'No se pudo leer Compras.' },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const access = await verifySession();
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.reason }, { status: authStatus(access.reason) });
  }

  const shopping = getPersonalShoppingRuntime();
  if (shopping.state !== 'ready') {
    return NextResponse.json(
      { ok: false, error: shopping.state, message: shopping.notice },
      { status: 503 },
    );
  }
  if (!shopping.writesEnabled) {
    return NextResponse.json(
      {
        ok: false,
        error: 'writes-disabled',
        message: 'Las escrituras de Compras están temporalmente deshabilitadas.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }
  if (!isRecord(body) || body.action !== 'add') {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const operationId = operationIdFrom(body);
  if (!operationId) {
    return NextResponse.json({ ok: false, error: 'invalid-operation-id' }, { status: 400 });
  }

  const result = await shopping.service.add({
    title: typeof body.title === 'string' ? body.title : '',
    state: typeof body.state === 'string' ? body.state : '',
    operationId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.code, message: result.message },
      { status: result.code === 'invalid-input' ? 400 : 503 },
    );
  }

  return NextResponse.json(result);
}
