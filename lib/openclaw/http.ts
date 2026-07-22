/**
 * Helpers HTTP compartidos de la API OpenClaw.
 */
import { NextResponse } from 'next/server';

import { verifyOpenClawRequest } from '@/lib/openclaw/auth';
import {
  getOpenClawApiConfig,
  isOpenClawApiEnabled,
  OPENCLAW_MAX_BODY_BYTES,
} from '@/lib/openclaw/config';
import { emitOpenClawLog, buildOpenClawLogEvent } from '@/lib/openclaw/observability';
import { resolveOpenClawRateLimitPort } from '@/lib/openclaw/rate-limit';
import type { OpenClawErrorCode, OpenClawErrorResponse } from '@/types/openclaw';

export const OPENCLAW_SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function openClawError(
  status: number,
  requestId: string,
  code: OpenClawErrorCode,
  message: string,
  retryable = false,
): NextResponse {
  const body: OpenClawErrorResponse = {
    ok: false,
    requestId,
    error: { code, message, retryable },
  };
  return NextResponse.json(body, { status, headers: OPENCLAW_SECURITY_HEADERS });
}

export type OpenClawParsedRequest = {
  requestId: string;
  keyId: string;
  actorId: string;
  rawBody: string;
  json: unknown | null;
  startedAt: number;
};

export async function parseAndAuthenticateOpenClawRequest(
  request: Request,
  options: { requireJsonBody: boolean },
): Promise<{ ok: true; value: OpenClawParsedRequest } | { ok: false; response: NextResponse }> {
  const startedAt = Date.now();
  const requestIdHeader = request.headers.get('x-vida-request-id');
  const fallbackId = requestIdHeader?.trim() || 'unknown';

  if (!isOpenClawApiEnabled()) {
    return {
      ok: false,
      response: openClawError(404, fallbackId, 'api-disabled', 'API OpenClaw desactivada.'),
    };
  }

  const contentType = request.headers.get('content-type') ?? '';
  const method = request.method.toUpperCase();
  let rawBody = '';

  if (method !== 'GET' && method !== 'HEAD') {
    if (options.requireJsonBody && !contentType.toLowerCase().includes('application/json')) {
      return {
        ok: false,
        response: openClawError(
          415,
          fallbackId,
          'invalid-content-type',
          'Content-Type application/json requerido.',
        ),
      };
    }
    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.byteLength > OPENCLAW_MAX_BODY_BYTES) {
      return {
        ok: false,
        response: openClawError(413, fallbackId, 'body-too-large', 'Body demasiado grande.'),
      };
    }
    rawBody = buf.toString('utf8');
  }

  const url = new URL(request.url);
  const auth = verifyOpenClawRequest({
    method,
    pathname: url.pathname,
    rawBody,
    keyIdHeader: request.headers.get('x-vida-key-id'),
    timestampHeader: request.headers.get('x-vida-timestamp'),
    signatureHeader: request.headers.get('x-vida-signature'),
    requestIdHeader: request.headers.get('x-vida-request-id'),
  });

  if (!auth.ok) {
    const status = auth.code === 'api-disabled' ? 404 : 401;
    return {
      ok: false,
      response: openClawError(status, fallbackId, auth.code, auth.message),
    };
  }

  const requestId = auth.requestId;
  const config = getOpenClawApiConfig();
  if (config.ok) {
    const rate = await resolveOpenClawRateLimitPort().allow(auth.keyId, config.ratePerMinute);
    if (!rate.ok) {
      return {
        ok: false,
        response: openClawError(429, requestId, 'rate-limited', 'Límite de tasa excedido.', true),
      };
    }
  }

  let json: unknown | null = null;
  if (rawBody) {
    try {
      json = JSON.parse(rawBody) as unknown;
    } catch {
      return {
        ok: false,
        response: openClawError(400, requestId, 'invalid-json', 'JSON inválido.'),
      };
    }
  } else if (options.requireJsonBody) {
    return {
      ok: false,
      response: openClawError(400, requestId, 'invalid-json', 'Body JSON requerido.'),
    };
  }

  return {
    ok: true,
    value: {
      requestId,
      keyId: auth.keyId,
      actorId: auth.actorId,
      rawBody,
      json,
      startedAt,
    },
  };
}

export function finishOpenClawOk(
  parsed: OpenClawParsedRequest,
  operation: string,
  body: unknown,
  meta?: { itemCount?: number; proposalCreated?: boolean },
): NextResponse {
  emitOpenClawLog(
    buildOpenClawLogEvent({
      requestId: parsed.requestId,
      operation,
      keyId: parsed.keyId,
      durationMs: Date.now() - parsed.startedAt,
      result: 'ok',
      itemCount: meta?.itemCount ?? null,
      proposalCreated: meta?.proposalCreated,
    }),
  );
  return NextResponse.json(body, { status: 200, headers: OPENCLAW_SECURITY_HEADERS });
}

export function finishOpenClawError(
  parsed: Pick<OpenClawParsedRequest, 'requestId' | 'keyId' | 'startedAt'>,
  operation: string,
  status: number,
  code: OpenClawErrorCode,
  message: string,
  retryable = false,
): NextResponse {
  emitOpenClawLog(
    buildOpenClawLogEvent({
      requestId: parsed.requestId,
      operation,
      keyId: parsed.keyId,
      durationMs: Date.now() - parsed.startedAt,
      result: 'error',
      errorCode: code,
    }),
  );
  return openClawError(status, parsed.requestId, code, message, retryable);
}
