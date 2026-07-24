export const LOCAL_DRAFT_VERSION = 1;
export const LOCAL_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const LOCAL_DRAFT_MAX_LENGTH = 250_000;

export const LOCAL_DRAFT_KEYS = {
  gym: 'gym-session',
  tasks: 'tasks-planning',
  projects: 'projects-review',
  inbox: 'inbox-planning',
  reviews: 'review-workspace',
} as const;

export type LocalDraftKey = (typeof LOCAL_DRAFT_KEYS)[keyof typeof LOCAL_DRAFT_KEYS];

const STORAGE_PREFIX = 'vida2:web-draft:v1:';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LocalDraftEnvelope<T> {
  version: number;
  savedAt: string;
  expiresAt: string;
  payload: T;
}

export type LocalDraftReadResult<T> =
  | {
      ok: true;
      value: T;
      savedAt: string;
      expiresAt: string;
    }
  | {
      ok: false;
      reason:
        | 'missing'
        | 'invalid-json'
        | 'invalid-envelope'
        | 'version-mismatch'
        | 'expired'
        | 'invalid-payload'
        | 'too-large'
        | 'storage-error';
    };

export type LocalDraftWriteResult =
  | { ok: true; savedAt: string; expiresAt: string }
  | { ok: false; reason: 'too-large' | 'storage-error' | 'serialization-error' };

export function localDraftStorageKey(key: LocalDraftKey): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function encodeLocalDraft<T>(
  payload: T,
  now = Date.now(),
  ttlMs = LOCAL_DRAFT_TTL_MS,
): string {
  const envelope: LocalDraftEnvelope<T> = {
    version: LOCAL_DRAFT_VERSION,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    payload,
  };
  return JSON.stringify(envelope);
}

export function decodeLocalDraft<T>(
  raw: string,
  validate: (value: unknown) => value is T,
  now = Date.now(),
): LocalDraftReadResult<T> {
  if (raw.length > LOCAL_DRAFT_MAX_LENGTH) return { ok: false, reason: 'too-large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid-envelope' };
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== LOCAL_DRAFT_VERSION) {
    return { ok: false, reason: 'version-mismatch' };
  }
  if (typeof envelope.savedAt !== 'string' || typeof envelope.expiresAt !== 'string') {
    return { ok: false, reason: 'invalid-envelope' };
  }

  const savedAt = Date.parse(envelope.savedAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(savedAt) || !Number.isFinite(expiresAt) || expiresAt <= savedAt) {
    return { ok: false, reason: 'invalid-envelope' };
  }
  if (expiresAt <= now) return { ok: false, reason: 'expired' };
  if (!validate(envelope.payload)) return { ok: false, reason: 'invalid-payload' };

  return {
    ok: true,
    value: envelope.payload,
    savedAt: envelope.savedAt,
    expiresAt: envelope.expiresAt,
  };
}

export function readLocalDraft<T>(
  storage: StorageLike,
  key: LocalDraftKey,
  validate: (value: unknown) => value is T,
  now = Date.now(),
): LocalDraftReadResult<T> {
  const storageKey = localDraftStorageKey(key);
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null) return { ok: false, reason: 'missing' };
    const result = decodeLocalDraft(raw, validate, now);
    if (!result.ok) storage.removeItem(storageKey);
    return result;
  } catch {
    return { ok: false, reason: 'storage-error' };
  }
}

export function writeLocalDraft<T>(
  storage: StorageLike,
  key: LocalDraftKey,
  payload: T,
  now = Date.now(),
  ttlMs = LOCAL_DRAFT_TTL_MS,
): LocalDraftWriteResult {
  let raw: string;
  try {
    raw = encodeLocalDraft(payload, now, ttlMs);
  } catch {
    return { ok: false, reason: 'serialization-error' };
  }
  if (raw.length > LOCAL_DRAFT_MAX_LENGTH) return { ok: false, reason: 'too-large' };

  try {
    storage.setItem(localDraftStorageKey(key), raw);
    const parsed = JSON.parse(raw) as LocalDraftEnvelope<T>;
    return { ok: true, savedAt: parsed.savedAt, expiresAt: parsed.expiresAt };
  } catch {
    return { ok: false, reason: 'storage-error' };
  }
}

export function removeLocalDraft(storage: StorageLike, key: LocalDraftKey): boolean {
  try {
    storage.removeItem(localDraftStorageKey(key));
    return true;
  } catch {
    return false;
  }
}
