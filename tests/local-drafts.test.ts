import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LOCAL_DRAFT_KEYS,
  LOCAL_DRAFT_MAX_LENGTH,
  LOCAL_DRAFT_TTL_MS,
  decodeLocalDraft,
  encodeLocalDraft,
  localDraftStorageKey,
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
  type StorageLike,
} from '@/lib/local-drafts/storage';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  fail = false;

  getItem(key: string): string | null {
    if (this.fail) throw new Error('blocked');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.fail) throw new Error('blocked');
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.fail) throw new Error('blocked');
    this.values.delete(key);
  }
}

const validPayload = (value: unknown): value is { text: string } =>
  typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string';

test('B1-LOCAL-1. las claves están versionadas y no incluyen Journaling', () => {
  const keys = Object.values(LOCAL_DRAFT_KEYS).map(localDraftStorageKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((key) => key.startsWith('vida2:web-draft:v1:')));
  assert.equal(
    keys.some((key) => /journal/i.test(key)),
    false,
  );
});

test('B1-LOCAL-2. un borrador válido conserva payload y vencimiento', () => {
  const now = Date.UTC(2026, 6, 24, 12);
  const raw = encodeLocalDraft({ text: 'hola' }, now);
  const decoded = decodeLocalDraft(raw, validPayload, now + 1_000);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.value, { text: 'hola' });
  assert.equal(Date.parse(decoded.expiresAt) - Date.parse(decoded.savedAt), LOCAL_DRAFT_TTL_MS);
});

test('B1-LOCAL-3. un borrador vencido se rechaza', () => {
  const now = Date.UTC(2026, 6, 24, 12);
  const raw = encodeLocalDraft({ text: 'hola' }, now, 1_000);
  assert.deepEqual(decodeLocalDraft(raw, validPayload, now + 1_001), {
    ok: false,
    reason: 'expired',
  });
});

test('B1-LOCAL-4. JSON inválido falla cerrado', () => {
  assert.deepEqual(decodeLocalDraft('{', validPayload), { ok: false, reason: 'invalid-json' });
});

test('B1-LOCAL-5. una versión desconocida no se restaura', () => {
  const raw = JSON.stringify({
    version: 99,
    savedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10_000).toISOString(),
    payload: { text: 'hola' },
  });
  assert.deepEqual(decodeLocalDraft(raw, validPayload), {
    ok: false,
    reason: 'version-mismatch',
  });
});

test('B1-LOCAL-6. el validador de dominio puede rechazar payload manipulado', () => {
  const raw = encodeLocalDraft({ text: 123 });
  assert.deepEqual(decodeLocalDraft(raw, validPayload), {
    ok: false,
    reason: 'invalid-payload',
  });
});

test('B1-LOCAL-7. el límite evita restaurar blobs excesivos', () => {
  const raw = 'x'.repeat(LOCAL_DRAFT_MAX_LENGTH + 1);
  assert.deepEqual(decodeLocalDraft(raw, validPayload), { ok: false, reason: 'too-large' });
});

test('B1-LOCAL-8. escribir, leer y eliminar usa una única clave local', () => {
  const storage = new MemoryStorage();
  const write = writeLocalDraft(storage, LOCAL_DRAFT_KEYS.inbox, { text: 'captura' });
  assert.equal(write.ok, true);
  assert.equal(storage.values.size, 1);

  const read = readLocalDraft(storage, LOCAL_DRAFT_KEYS.inbox, validPayload);
  assert.equal(read.ok, true);
  assert.equal(removeLocalDraft(storage, LOCAL_DRAFT_KEYS.inbox), true);
  assert.equal(storage.values.size, 0);
});

test('B1-LOCAL-9. almacenamiento bloqueado no lanza errores al usuario', () => {
  const storage = new MemoryStorage();
  storage.fail = true;
  assert.deepEqual(readLocalDraft(storage, LOCAL_DRAFT_KEYS.tasks, validPayload), {
    ok: false,
    reason: 'storage-error',
  });
  assert.deepEqual(writeLocalDraft(storage, LOCAL_DRAFT_KEYS.tasks, { text: 'x' }), {
    ok: false,
    reason: 'storage-error',
  });
  assert.equal(removeLocalDraft(storage, LOCAL_DRAFT_KEYS.tasks), false);
});
