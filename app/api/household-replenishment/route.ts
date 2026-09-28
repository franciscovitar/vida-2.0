import { NextResponse } from 'next/server';

import { verifyHouseholdAccess } from '@/lib/household-replenishment/access';
import { getHouseholdReplenishmentRuntime } from '@/lib/household-replenishment/runtime';
import type {
  ReplenishmentMutationResult,
  UserCorrectionType,
} from '@/lib/household-replenishment/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = Record<string, unknown>;

function isRecord(value: unknown): value is RequestBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function operationIdFrom(body: RequestBody): string | null {
  const value = body.operationId;
  if (typeof value !== 'string') return null;
  const operationId = value.trim();
  return operationId.length >= 8 && operationId.length <= 120 ? operationId : null;
}

function correctionTypeFrom(value: unknown): UserCorrectionType | null {
  return value === 'STILL_HAVE' || value === 'LOW' || value === 'OUT' ? value : null;
}

function failureStatus(code: 'invalid-input' | 'not-found'): number {
  return code === 'not-found' ? 404 : 400;
}

export async function GET() {
  const access = await verifyHouseholdAccess();
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.reason },
      { status: access.reason === 'email-not-allowed' ? 403 : 401 },
    );
  }

  const householdRuntime = getHouseholdReplenishmentRuntime();
  if (householdRuntime.state !== 'ready') {
    return NextResponse.json(
      { ok: false, error: householdRuntime.state, message: householdRuntime.notice },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json({
      ok: true,
      snapshot: await householdRuntime.service.snapshot(access.householdId),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'storage-error',
        message: 'No se pudo leer la lista compartida.',
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const access = await verifyHouseholdAccess();
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.reason },
      { status: access.reason === 'email-not-allowed' ? 403 : 401 },
    );
  }

  const householdRuntime = getHouseholdReplenishmentRuntime();
  if (householdRuntime.state !== 'ready') {
    return NextResponse.json(
      { ok: false, error: householdRuntime.state, message: householdRuntime.notice },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  if (!isRecord(body) || typeof body.action !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const operationId = operationIdFrom(body);
  if (!operationId) {
    return NextResponse.json({ ok: false, error: 'invalid-operation-id' }, { status: 400 });
  }

  try {
    let result: ReplenishmentMutationResult;
    if (body.action === 'add') {
    const seedIntervalDays =
      typeof body.seedIntervalDays === 'number' ? body.seedIntervalDays : null;
    result = await householdRuntime.service.addManualNeed({
      householdId: access.householdId,
      name: typeof body.name === 'string' ? body.name : '',
      seedIntervalDays,
      operationId,
      principalId: access.principalId,
    });
  } else if (body.action === 'bought') {
    result = await householdRuntime.service.markBought({
      householdId: access.householdId,
      needId: typeof body.needId === 'string' ? body.needId : '',
      operationId,
      principalId: access.principalId,
    });
  } else if (body.action === 'correct') {
    const type = correctionTypeFrom(body.type);
    if (!type) {
      return NextResponse.json({ ok: false, error: 'invalid-correction' }, { status: 400 });
    }
    result = await householdRuntime.service.correctNeed({
      householdId: access.householdId,
      needId: typeof body.needId === 'string' ? body.needId : '',
      type,
      operationId,
      principalId: access.principalId,
    });
    } else {
      return NextResponse.json({ ok: false, error: 'invalid-action' }, { status: 400 });
    }

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.code, message: result.message },
        { status: failureStatus(result.code) },
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'storage-error',
        message: 'No se pudo guardar el cambio en la lista compartida.',
      },
      { status: 503 },
    );
  }
}
