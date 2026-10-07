import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/auth/dal';
import { getPersonalShoppingRuntime } from '@/lib/personal-shopping/runtime';
import type { PersonalShoppingMutationResult } from '@/lib/personal-shopping/service';
import type { PersonalPurchaseDetailPatch } from '@/lib/personal-shopping/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = Record<string, unknown>;

type ParseResult<T> = { ok: true; value: T } | { ok: false };

function isRecord(value: unknown): value is RequestBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function operationIdFrom(body: RequestBody): string | null {
  if (typeof body.operationId !== 'string') return null;
  const value = body.operationId.trim();
  return value.length >= 8 && value.length <= 120 ? value : null;
}

function itemIdFrom(body: RequestBody): string | null {
  if (typeof body.itemId !== 'string') return null;
  const value = body.itemId.trim();
  return value.length >= 3 && value.length <= 180 ? value : null;
}

function nullableString(value: unknown): ParseResult<string | null> {
  if (value === null) return { ok: true, value: null };
  return typeof value === 'string' ? { ok: true, value } : { ok: false };
}

function nullableMinor(value: unknown): ParseResult<number | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return { ok: true, value };
  }
  return { ok: false };
}

function stringArray(value: unknown): ParseResult<string[]> {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return { ok: false };
  }
  return { ok: true, value };
}

function detailPatchFrom(body: RequestBody): PersonalPurchaseDetailPatch | null {
  const need = nullableString(body.need);
  const quantityText = nullableString(body.quantityText);
  const category = nullableString(body.category);
  const currency = nullableString(body.currency);
  const estimatedPriceMinor = nullableMinor(body.estimatedPriceMinor);
  const targetPriceMinor = nullableMinor(body.targetPriceMinor);
  const purchaseCondition = nullableString(body.purchaseCondition);
  const notes = nullableString(body.notes);
  const candidateLinks = stringArray(body.candidateLinks);
  if (
    !need.ok ||
    !quantityText.ok ||
    !category.ok ||
    !currency.ok ||
    !estimatedPriceMinor.ok ||
    !targetPriceMinor.ok ||
    !purchaseCondition.ok ||
    !notes.ok ||
    !candidateLinks.ok ||
    typeof body.focus !== 'boolean'
  ) {
    return null;
  }

  return {
    need: need.value,
    quantityText: quantityText.value,
    category: category.value,
    currency: currency.value,
    estimatedPriceMinor: estimatedPriceMinor.value,
    targetPriceMinor: targetPriceMinor.value,
    purchaseCondition: purchaseCondition.value,
    notes: notes.value,
    candidateLinks: candidateLinks.value,
    focus: body.focus,
  };
}

function authStatus(reason: string): number {
  return reason === 'email-not-allowed' || reason === 'email-unverified' ? 403 : 401;
}

function mutationStatus(code: string): number {
  if (code === 'invalid-input') return 400;
  if (code === 'not-found') return 404;
  return 503;
}

export async function GET() {
  const access = await verifySession();
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.reason },
      { status: authStatus(access.reason) },
    );
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
    return NextResponse.json(
      { ok: false, error: access.reason },
      { status: authStatus(access.reason) },
    );
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
  if (!isRecord(body) || typeof body.action !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const operationId = operationIdFrom(body);
  if (!operationId) {
    return NextResponse.json({ ok: false, error: 'invalid-operation-id' }, { status: 400 });
  }

  let result: PersonalShoppingMutationResult;
  if (body.action === 'add') {
    result = await shopping.service.add({
      title: typeof body.title === 'string' ? body.title : '',
      state: typeof body.state === 'string' ? body.state : '',
      operationId,
    });
  } else if (body.action === 'update-details') {
    const itemId = itemIdFrom(body);
    const patch = detailPatchFrom(body);
    if (!itemId || !patch) {
      return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
    }
    result = await shopping.service.updateDetails({ itemId, operationId, patch });
  } else if (body.action === 'transition') {
    const itemId = itemIdFrom(body);
    if (!itemId || typeof body.toState !== 'string') {
      return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
    }
    result = await shopping.service.transition({
      itemId,
      toState: body.toState,
      operationId,
    });
  } else {
    return NextResponse.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.code, message: result.message },
      { status: mutationStatus(result.code) },
    );
  }

  return NextResponse.json(result);
}
