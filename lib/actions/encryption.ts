/**
 * Cifrado AES-256-GCM de payloads de propuesta.
 * Nunca registrar plaintext, nonce ni clave.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { payloadDigestFromPlaintext } from '@/lib/actions/opaque';

export type EncryptedProposalEnvelope = {
  v: 1;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export type EncryptedPayloadStore = {
  put(key: string, envelope: EncryptedProposalEnvelope, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<EncryptedProposalEnvelope | null>;
  delete(key: string): Promise<void>;
};

const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export function validateEncryptionKey(raw: string | undefined | null): Buffer | null {
  if (!raw || !raw.trim()) return null;
  try {
    const buf = Buffer.from(raw.trim(), 'base64');
    if (buf.length !== KEY_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

export function payloadDigest(plaintextJson: string): string {
  return payloadDigestFromPlaintext(plaintextJson);
}

export function encryptProposalPayload(
  key: Buffer,
  plaintextJson: string,
): EncryptedProposalEnvelope {
  if (key.length !== KEY_BYTES) {
    throw new Error('encryption-key-invalid');
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintextJson, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    nonce: nonce.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptProposalPayload(key: Buffer, envelope: EncryptedProposalEnvelope): string {
  if (key.length !== KEY_BYTES) {
    throw new Error('encryption-key-invalid');
  }
  if (envelope.v !== 1) {
    throw new Error('encryption-envelope-unsupported');
  }
  const nonce = Buffer.from(envelope.nonce, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

export function createMemoryEncryptedPayloadStore(): EncryptedPayloadStore & {
  size: () => number;
} {
  const map = new Map<string, { envelope: EncryptedProposalEnvelope; expiresAt: number }>();
  return {
    size() {
      return map.size;
    },
    async put(key, envelope, ttlSeconds) {
      const ttl = Math.max(1, Math.floor(ttlSeconds));
      map.set(key, { envelope, expiresAt: Date.now() + ttl * 1000 });
    },
    async get(key) {
      const row = map.get(key);
      if (!row) return null;
      if (Date.now() > row.expiresAt) {
        map.delete(key);
        return null;
      }
      return row.envelope;
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

/** Clave de almacenamiento opaca (no revelar proposalKey crudo si se desea). */
export function encryptedPayloadStorageKey(proposalKey: string, digest: string): string {
  return createHash('sha256').update(`enc:${proposalKey}:${digest}`).digest('hex').slice(0, 40);
}
