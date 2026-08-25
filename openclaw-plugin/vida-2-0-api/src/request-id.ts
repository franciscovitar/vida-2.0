/**
 * Cryptographically unique request IDs for `X-Vida-Request-Id`.
 * Grammar: 1-128 ASCII chars, `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`.
 * UUID v4 satisfies this grammar (hex digits and hyphens only, first char
 * is always a hex digit).
 */
import { randomUUID } from 'node:crypto';

export type RequestIdGenerator = () => string;

export function createDefaultRequestIdGenerator(): RequestIdGenerator {
  return () => randomUUID();
}

export const VIDA_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isValidVidaRequestId(value: string): boolean {
  return VIDA_REQUEST_ID_PATTERN.test(value);
}
