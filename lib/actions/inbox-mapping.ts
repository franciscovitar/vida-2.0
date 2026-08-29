/**
 * Durable mapping store for inbox capture block IDs (rollback ownership-scoped).
 * Key = hash(opaque inbox key); value = encrypted { blockId, ownership }.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  executeRedisCommand,
  type UpstashRedisFetch,
  type UpstashRestConfig,
} from '@/lib/actions/upstash-rest';
import type { OwnershipProof } from '@/lib/actions/ports';

export type InboxCaptureMapping = {
  blockId: string;
  ownership: OwnershipProof;
};

export type InboxCaptureMappingStore = {
  put(opaqueKey: string, mapping: InboxCaptureMapping, ttlSeconds: number): Promise<void>;
  get(opaqueKey: string): Promise<InboxCaptureMapping | null>;
  delete(opaqueKey: string): Promise<void>;
};

const NONCE_BYTES = 12;
const MAX_MAPPING_CHARS = 4 * 1024;

function mappingStorageHash(opaqueInboxKey: string): string {
  return createHash('sha256').update(`inbox-map:${opaqueInboxKey}`).digest('hex').slice(0, 40);
}

function mappingRedisKey(writesNamespace: string, opaqueInboxKey: string): string {
  return `${writesNamespace}:inbox-map:${mappingStorageHash(opaqueInboxKey)}`;
}

function encryptMapping(key: Buffer, mapping: InboxCaptureMapping): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const plaintext = JSON.stringify(mapping);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    nonce: nonce.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

function decryptMapping(key: Buffer, raw: string): InboxCaptureMapping | null {
  try {
    const parsed = JSON.parse(raw) as {
      v?: number;
      nonce?: string;
      ciphertext?: string;
      tag?: string;
    };
    if (parsed.v !== 1 || !parsed.nonce || !parsed.ciphertext || !parsed.tag) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.nonce, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
      decipher.final(),
    ]);
    const obj = JSON.parse(plain.toString('utf8')) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const record = obj as Record<string, unknown>;
    if (typeof record.blockId !== 'string' || typeof record.ownership !== 'string') return null;
    if (!record.blockId || !record.ownership) return null;
    return { blockId: record.blockId, ownership: record.ownership };
  } catch {
    return null;
  }
}

export function createMemoryInboxCaptureMappingStore(): InboxCaptureMappingStore & {
  size: () => number;
} {
  const map = new Map<string, { mapping: InboxCaptureMapping; expiresAt: number }>();
  return {
    size() {
      return map.size;
    },
    async put(opaqueKey, mapping, ttlSeconds) {
      map.set(opaqueKey, {
        mapping,
        expiresAt: Date.now() + Math.max(1, Math.floor(ttlSeconds)) * 1000,
      });
    },
    async get(opaqueKey) {
      const row = map.get(opaqueKey);
      if (!row) return null;
      if (Date.now() > row.expiresAt) {
        map.delete(opaqueKey);
        return null;
      }
      return row.mapping;
    },
    async delete(opaqueKey) {
      map.delete(opaqueKey);
    },
  };
}

export function createUpstashInboxCaptureMappingStore(
  config: UpstashRestConfig,
  encryptionKey: Buffer,
  fetchImpl: UpstashRedisFetch = fetch,
): InboxCaptureMappingStore {
  return {
    async put(opaqueKey, mapping, ttlSeconds) {
      const serialized = encryptMapping(encryptionKey, mapping);
      if (serialized.length > MAX_MAPPING_CHARS) {
        throw new Error('inbox-mapping-oversize');
      }
      const redisKey = mappingRedisKey(config.namespace, opaqueKey);
      const ttl = Math.max(1, Math.floor(ttlSeconds));
      await executeRedisCommand(config, ['SET', redisKey, serialized, 'EX', ttl], fetchImpl);
    },
    async get(opaqueKey) {
      const redisKey = mappingRedisKey(config.namespace, opaqueKey);
      const raw = await executeRedisCommand(config, ['GET', redisKey], fetchImpl);
      if (typeof raw !== 'string' || !raw) return null;
      return decryptMapping(encryptionKey, raw);
    },
    async delete(opaqueKey) {
      const redisKey = mappingRedisKey(config.namespace, opaqueKey);
      await executeRedisCommand(config, ['DEL', redisKey], fetchImpl);
    },
  };
}
