/**
 * Helpers HTTP compartidos de la API OpenClaw.
 */
import { NextResponse } from 'next/server';

import { verifyOpenClawRequest } from '@/lib/openclaw/auth';
import {
  decodeOpenClawUtf8,
  parseOpenClawJsonStrict,
  readOpenClawBodyBytes,
} from '@/lib/openclaw/body';
import {
  getOpenClawApiConfig,
  isOpenClawApiEnabled,
  OPENCLAW_MAX_BODY_BYTES,
  OPENCLAW_REPLAY_TTL_SECONDS,
} from '@/lib/openclaw/config';
import { emitOpenClawLog, buildOpenClawLogEvent } from '@/lib/openclaw/observability';
import { resolveOpenClawRateLimitPort } from '@/lib/openclaw/rate-limit';
import { resolveOpenClawReplayPort } from '@/lib/openclaw/replay';
import {
  validateOpenClawRouteContract,
  type OpenClawRouteContract,
} from '@/lib/openclaw/route-contract';
import type {
  OpenClawDataFreshness,
  OpenClawErrorCode,
  OpenClawErrorResponse,
} from '@/types/openclaw';

export const OPENCLAW_SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const EMPTY_BODY = new Uint8Array(0);

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

function hasUnexpectedBody(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  const transferEncoding = request.headers.get('transfer-encoding');
  return (
    request.body !== null ||
    transferEncoding !== null ||
    (contentLength !== null && contentLength !== '0')
  );
}

export async function parseAndAuthenticateOpenClawRequest(
  request: Request,
  contract: OpenClawRouteContract,
): Promise<{ ok: true; value: OpenClawParsedRequest } | { ok: false; response: NextResponse }> {
  const startedAt = Date.now();

  if (!isOpenClawApiEnabled()) {
    return {
      ok: false,
      response: openClawError(404, 'unknown', 'api-disabled', 'API OpenClaw desactivada.'),
    };
  }

  const target = validateOpenClawRouteContract(
    { method: request.method, url: request.url },
    contract,
  );
  if (!target.ok) {
    return {
      ok: false,
      response: openClawError(target.status, 'unknown', target.code, target.message),
    };
  }

  const contentType = request.headers.get('content-type') ?? '';
  let rawBodyBytes: Uint8Array<ArrayBufferLike> = EMPTY_BODY;

  if (contract.body === 'none') {
    if (hasUnexpectedBody(request)) {
      return {
        ok: false,
        response: openClawError(
          400,
          'unknown',
          'invalid-input',
          'Body no permitido para esta ruta.',
        ),
      };
    }
  } else {
    if (!JSON_CONTENT_TYPE_PATTERN.test(contentType)) {
      return {
        ok: false,
        response: openClawError(
          415,
          'unknown',
          'invalid-content-type',
          'Content-Type application/json requerido.',
        ),
      };
    }

    const read = await readOpenClawBodyBytes(request, OPENCLAW_MAX_BODY_BYTES);
    if (!read.ok) {
      if (read.reason === 'body-too-large') {
        return {
          ok: false,
          response: openClawError(413, 'unknown', 'body-too-large', 'Body demasiado grande.'),
        };
      }
      return {
        ok: false,
        response: openClawError(400, 'unknown', 'invalid-input', 'Body no legible.'),
      };
    }
    rawBodyBytes = read.bytes;
  }

  const auth = verifyOpenClawRequest({
    method: target.method,
    pathname: target.pathname,
    rawBody: rawBodyBytes,
    keyIdHeader: request.headers.get('x-vida-key-id'),
    timestampHeader: request.headers.get('x-vida-timestamp'),
    signatureHeader: request.headers.get('x-vida-signature'),
    requestIdHeader: request.headers.get('x-vida-request-id'),
  });

  if (!auth.ok) {
    if (auth.code === 'api-disabled') {
      return {
        ok: false,
        response: openClawError(404, 'unknown', 'api-disabled', 'API OpenClaw desactivada.'),
      };
    }
    return {
      ok: false,
      response: openClawError(401, 'unknown', 'unauthorized', 'Autenticación inválida.'),
    };
  }

  const requestId = auth.requestId;
  const config = getOpenClawApiConfig();
  if (config.ok) {
    const rate = await resolveOpenClawRateLimitPort().allow(auth.keyId, config.ratePerMinute);
    if (!rate.ok) {
      if (rate.reason === 'rate-limited') {
        return {
          ok: false,
          response: openClawError(429, requestId, 'rate-limited', 'Límite de tasa excedido.', true),
        };
      }
      return {
        ok: false,
        response: openClawError(
          503,
          requestId,
          'security-control-unavailable',
          'Control de seguridad no disponible.',
          true,
        ),
      };
    }
  }

  const replay = await resolveOpenClawReplayPort().reserve(
    auth.replayKeys,
    OPENCLAW_REPLAY_TTL_SECONDS,
  );
  if (!replay.ok) {
    if (replay.reason === 'replay-detected') {
      return {
        ok: false,
        response: openClawError(409, requestId, 'replay-detected', 'Solicitud duplicada.'),
      };
    }
    return {
      ok: false,
      response: openClawError(
        503,
        requestId,
        'security-control-unavailable',
        'Control de seguridad no disponible.',
        true,
      ),
    };
  }

  let rawBody = '';
  let json: unknown | null = null;

  if (contract.body === 'json') {
    if (rawBodyBytes.byteLength === 0) {
      return {
        ok: false,
        response: openClawError(400, requestId, 'invalid-json', 'Body JSON requerido.'),
      };
    }

    const decoded = decodeOpenClawUtf8(rawBodyBytes);
    if (!decoded.ok) {
      return {
        ok: false,
        response: openClawError(400, requestId, 'invalid-json', 'JSON inválido.'),
      };
    }

    const strictJson = parseOpenClawJsonStrict(decoded.text);
    if (!strictJson.ok) {
      return {
        ok: false,
        response: openClawError(400, requestId, 'invalid-json', 'JSON inválido.'),
      };
    }

    rawBody = decoded.text;
    json = strictJson.value;
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
  meta?: {
    itemCount?: number;
    sourceCount?: number;
    dataFreshness?: OpenClawDataFreshness | null;
  },
): NextResponse {
  emitOpenClawLog(
    buildOpenClawLogEvent({
      requestId: parsed.requestId,
      operation,
      keyId: parsed.keyId,
      durationMs: Date.now() - parsed.startedAt,
      result: 'ok',
      itemCount: meta?.itemCount ?? null,
      sourceCount: meta?.sourceCount ?? null,
      dataFreshness: meta?.dataFreshness ?? null,
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
