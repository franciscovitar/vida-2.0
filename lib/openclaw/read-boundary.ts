export const OPENCLAW_MAX_RESPONSE_BYTES = 256 * 1024;

export type OpenClawReadBoundary =
  { ok: true } | { ok: false; reason: 'unsafe-output' | 'response-too-large' };

const FORBIDDEN_KEYS = new Set([
  'id',
  'uuid',
  'sourceRef',
  'rawBody',
  'token',
  'secret',
  'signature',
  'canonical',
  'email',
  'attendees',
  'conferenceData',
  'hangoutLink',
  'accessToken',
  'refreshToken',
]);

const FORBIDDEN_TEXT = [
  /secret_/i,
  /Bearer\s+/i,
  /BEGIN (?:RSA |EC )?PRIVATE KEY/i,
  /https?:\/\//i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[0-9a-f]{32}\b/i,
  /journaling/i,
];

function badKey(key: string): boolean {
  if (FORBIDDEN_KEYS.has(key)) return true;
  if (/(?:^|[_-])(?:id|uuid)$/i.test(key)) return true;
  if (/(?:Id|ID|Uuid|UUID)$/.test(key)) return true;
  return false;
}

function safeString(key: string | null, value: string): boolean {
  if (value.length > 4_000) return false;
  if (key === 'href') {
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
  }
  return !FORBIDDEN_TEXT.some((pattern) => pattern.test(value));
}

export function validateOpenClawReadBoundary(value: unknown): OpenClawReadBoundary {
  let nodes = 0;
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number, key: string | null): boolean => {
    nodes += 1;
    if (nodes > 5_000 || depth > 12) return false;
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'number') return Number.isFinite(current);
    if (typeof current === 'string') return safeString(key, current);
    if (typeof current !== 'object') return false;
    if (seen.has(current)) return false;
    seen.add(current);

    if (Array.isArray(current)) {
      return current.length <= 200 && current.every((item) => visit(item, depth + 1, key));
    }

    const proto = Object.getPrototypeOf(current);
    if (proto !== Object.prototype && proto !== null) return false;
    const entries = Object.entries(current as Record<string, unknown>);
    if (entries.length > 100) return false;

    for (const [childKey, childValue] of entries) {
      if (badKey(childKey) || !visit(childValue, depth + 1, childKey)) return false;
    }
    return true;
  };

  if (!visit(value, 0, null)) return { ok: false, reason: 'unsafe-output' };

  try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > OPENCLAW_MAX_RESPONSE_BYTES) {
      return { ok: false, reason: 'response-too-large' };
    }
  } catch {
    return { ok: false, reason: 'unsafe-output' };
  }

  return { ok: true };
}
