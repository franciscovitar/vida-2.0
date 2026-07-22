/**
 * Autenticación HMAC-SHA256 server-to-server para OpenClaw.
 * Sin cookies de usuario. Nunca registrar firma ni secreto.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  getOpenClawApiConfig,
  isOpenClawApiEnabled,
  OPENCLAW_MAX_TIMESTAMP_SKEW_MS,
  openClawActorId,
} from '@/lib/openclaw/config';
import type { OpenClawAuthDecision } from '@/types/openclaw';

// OpenClawAuthDecision reused by callers via re-export if needed.
export type { OpenClawAuthDecision };

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildCanonicalString(input: {
  timestamp: string;
  method: string;
  pathname: string;
  rawBody: string;
}): string {
  const bodyHash = sha256Hex(input.rawBody);
  return `${input.timestamp}\n${input.method.toUpperCase()}\n${input.pathname}\n${bodyHash}`;
}

export function signCanonical(secret: string, canonical: string): string {
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function signaturesMatch(expectedHex: string, provided: string): boolean {
  try {
    const a = Buffer.from(expectedHex, 'utf8');
    const b = Buffer.from(provided.trim(), 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyOpenClawRequest(input: {
  env?: Readonly<Record<string, string | undefined>>;
  method: string;
  pathname: string;
  rawBody: string;
  keyIdHeader: string | null;
  timestampHeader: string | null;
  signatureHeader: string | null;
  requestIdHeader: string | null;
  nowMs?: number;
}):
  | { ok: true; keyId: string; actorId: string; requestId: string }
  | { ok: false; code: import('@/types/openclaw').OpenClawErrorCode; message: string } {
  const env = input.env ?? process.env;
  if (!isOpenClawApiEnabled(env)) {
    return { ok: false, code: 'api-disabled', message: 'API OpenClaw desactivada.' };
  }

  const requestId = input.requestIdHeader?.trim() ?? '';
  if (!requestId) {
    return { ok: false, code: 'unauthorized', message: 'X-Vida-Request-Id requerido.' };
  }

  const config = getOpenClawApiConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      code: config.reason === 'flag-disabled' ? 'api-disabled' : 'unauthorized',
      message: 'API OpenClaw no configurada.',
    };
  }

  const keyId = input.keyIdHeader?.trim() ?? '';
  if (!keyId || keyId !== config.keyId) {
    return { ok: false, code: 'unauthorized', message: 'Key ID desconocida.' };
  }

  const timestampRaw = input.timestampHeader?.trim() ?? '';
  const timestampMs = Number(timestampRaw);
  if (!timestampRaw || !Number.isFinite(timestampMs)) {
    return { ok: false, code: 'unauthorized', message: 'Timestamp inválido.' };
  }
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - timestampMs) > OPENCLAW_MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, code: 'expired-request', message: 'Timestamp fuera de ventana.' };
  }

  const signature = input.signatureHeader?.trim() ?? '';
  if (!signature) {
    return { ok: false, code: 'invalid-signature', message: 'Firma ausente.' };
  }

  const canonical = buildCanonicalString({
    timestamp: timestampRaw,
    method: input.method,
    pathname: input.pathname,
    rawBody: input.rawBody,
  });
  const expected = signCanonical(config.secret, canonical);
  if (!signaturesMatch(expected, signature)) {
    return { ok: false, code: 'invalid-signature', message: 'Firma inválida.' };
  }

  return { ok: true, keyId, actorId: openClawActorId(keyId), requestId };
}
