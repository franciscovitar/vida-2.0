export const OPENCLAW_MAX_RESPONSE_BYTES = 256 * 1024;

export type OpenClawReadBoundary =
  { ok: true } | { ok: false; reason: 'unsafe-output' | 'response-too-large' };

/** Claves exactas prohibidas (caso-sensible al nombre de propiedad JSON). */
const FORBIDDEN_KEYS = new Set([
  'id',
  'uuid',
  'sourceRef',
  'rawBody',
  'raw',
  'token',
  'secret',
  'signature',
  'canonical',
  'email',
  'mail',
  'e-mail',
  'ownerEmail',
  'userEmail',
  'contactEmail',
  'attendeeEmails',
  'attendees',
  'recipients',
  'participants',
  'organizer',
  'creator',
  'createdBy',
  'updatedBy',
  'conferenceData',
  'hangoutLink',
  'accessToken',
  'refreshToken',
  'metadata',
  'privateMetadata',
]);

/** Patrón de correo acotado (no RFC completo). */
const EMAIL_IN_TEXT =
  /(?:^|[^a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[^a-zA-Z0-9._%+-]|$)/;

const FORBIDDEN_TEXT = [
  /secret_/i,
  /Bearer\s+/i,
  /BEGIN (?:RSA |EC )?PRIVATE KEY/i,
  /https?:\/\//i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[0-9a-f]{32}\b/i,
  /journaling/i,
  EMAIL_IN_TEXT,
];

function normalizeKey(key: string): string {
  return key.replace(/[-_]/g, '').toLowerCase();
}

function badKey(key: string): boolean {
  if (FORBIDDEN_KEYS.has(key)) return true;
  const normalized = normalizeKey(key);
  if (
    normalized === 'email' ||
    normalized === 'mail' ||
    normalized.endsWith('email') ||
    normalized.endsWith('emails') ||
    normalized === 'raw' ||
    normalized === 'metadata' ||
    normalized === 'privatemetadata' ||
    normalized === 'organizer' ||
    normalized === 'creator' ||
    normalized === 'createdby' ||
    normalized === 'updatedby' ||
    normalized === 'recipients' ||
    normalized === 'participants' ||
    normalized === 'attendees' ||
    normalized === 'sourceref' ||
    normalized === 'canonical' ||
    normalized === 'signature' ||
    normalized === 'token' ||
    normalized === 'secret'
  ) {
    return true;
  }
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

/**
 * Valida privacidad/semántica del DTO de lectura.
 * No mide el tamaño del envelope HTTP final.
 */
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
  return { ok: true };
}

/**
 * Mide el JSON serializado completo de la respuesta (UTF-8).
 * Debe aplicarse al envelope final, no solo al DTO interno.
 */
export function validateOpenClawSerializedResponseSize(response: unknown): OpenClawReadBoundary {
  try {
    const bytes = Buffer.byteLength(JSON.stringify(response), 'utf8');
    if (bytes > OPENCLAW_MAX_RESPONSE_BYTES) {
      return { ok: false, reason: 'response-too-large' };
    }
  } catch {
    return { ok: false, reason: 'unsafe-output' };
  }
  return { ok: true };
}
