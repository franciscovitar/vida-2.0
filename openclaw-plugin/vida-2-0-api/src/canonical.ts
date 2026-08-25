/**
 * Vida's canonical HMAC v2 signing contract, reimplemented independently
 * from `lib/openclaw/auth.ts` in the main web app (a separate process and a
 * separate npm project). Keep the algorithm identical by hand:
 *
 *   vida2-openclaw-hmac-v2
 *   timestamp
 *   requestId
 *   METHOD
 *   pathname
 *   sha256Hex(rawBody)
 */
import { createHash, createHmac } from 'node:crypto';

export const VIDA_HMAC_PROTOCOL = 'vida2-openclaw-hmac-v2';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');
}

export function buildCanonicalString(params: {
  timestamp: string;
  requestId: string;
  method: string;
  pathname: string;
  rawBody: string;
}): string {
  const bodyHash = sha256Hex(params.rawBody);
  return [
    VIDA_HMAC_PROTOCOL,
    params.timestamp,
    params.requestId,
    params.method.toUpperCase(),
    params.pathname,
    bodyHash,
  ].join('\n');
}

export function signCanonical(secret: string, canonical: string): string {
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

/** 13-digit epoch-millisecond timestamp string, matching Vida's `X-Vida-Timestamp` grammar. */
export function formatTimestamp(nowMs: number): string {
  return String(Math.trunc(nowMs));
}
