/**
 * Coordinación distribuida de escrituras (idempotencia + leases).
 * Namespace separado de OpenClaw: vida2:writes:<env>:<contractVersion>
 *
 * Resultados finales en Upstash se almacenan cifrados (AES-256-GCM).
 * Nunca enviar ActionResult en claro a Redis.
 */
import {
  decryptProposalPayload,
  encryptProposalPayload,
  ENCRYPTED_PAYLOAD_MAX_CHARS,
  type EncryptedProposalEnvelope,
} from '@/lib/actions/encryption';
import { coordinationKeyHash } from '@/lib/actions/opaque';
import { isAllowedActionType } from '@/lib/actions/policy';
import {
  evalRedisScript,
  executeRedisCommand,
  resolveUpstashEnvironment,
  resolveUpstashRestConfig,
  type UpstashRedisCommandPart,
  type UpstashRedisFetch,
  type UpstashRestConfig,
} from '@/lib/actions/upstash-rest';
import { WRITE_CONTRACT_VERSION } from '@/types/actions';
import type {
  ActionResult,
  ActionResultCode,
  ActionTarget,
  ActionTargetType,
} from '@/types/actions';

export type WriteCoordinationConfig = UpstashRestConfig;

export type WriteCoordinationConfigResult =
  { ok: true; value: WriteCoordinationConfig } | { ok: false };

export type WriteRedisFetch = UpstashRedisFetch;
export type WriteRedisCommandPart = UpstashRedisCommandPart;

/** Envelope AES-256-GCM del ActionResult (mismo formato que propuestas). */
export type EncryptedActionResultEnvelope = EncryptedProposalEnvelope;

/** Límite fail-closed del JSON de ActionResult antes de cifrar. */
export const ACTION_RESULT_PLAINTEXT_MAX_CHARS = 16 * 1024;

export type ReserveIdempotencyResult =
  | { status: 'reserved' }
  | { status: 'conflict'; reason: 'digest-mismatch' | 'in-progress' | 'final' }
  | { status: 'replay'; result: ActionResult };

export type LeaseAcquireResult =
  { status: 'acquired'; token: string } | { status: 'conflict' } | { status: 'unavailable' };

export interface WriteCoordinationPort {
  reserveIdempotency(input: {
    actorHash: string;
    actionType: string;
    idempotencyKey: string;
    payloadDigest: string;
    ttlSeconds: number;
  }): Promise<ReserveIdempotencyResult>;
  getIdempotentResult(input: {
    actorHash: string;
    actionType: string;
    idempotencyKey: string;
  }): Promise<ActionResult | null>;
  acquireProposalLease(input: {
    proposalKey: string;
    purpose: 'approve' | 'reject' | 'rollback';
    ttlSeconds: number;
  }): Promise<LeaseAcquireResult>;
  releaseProposalLease(input: {
    proposalKey: string;
    purpose: 'approve' | 'reject' | 'rollback';
    token: string;
  }): Promise<void>;
  markFinal(input: {
    actorHash: string;
    actionType: string;
    idempotencyKey: string;
    payloadDigest: string;
    result: ActionResult;
    ttlSeconds: number;
  }): Promise<void>;
}

const ACTION_RESULT_CODES = new Set<string>([
  'applied',
  'idempotent-replay',
  'rejected',
  'conflict',
  'verification-failed',
  'partial',
  'failed',
  'not-configured',
  'flag-disabled',
  'unauthorized',
  'invalid-payload',
  'policy-denied',
  'in-progress',
  'applied-audit-pending',
  'expired',
  'rolled-back',
  'rollback-failed',
  'lease-conflict',
  'misconfigured',
]);

const ACTION_TARGET_TYPES = new Set<string>([
  'task',
  'inbox',
  'gym-session',
  'proposal',
  'calendar-hold',
  'calendar-block',
  'system',
]);

const ACTION_RESULT_KEYS = new Set([
  'ok',
  'code',
  'message',
  'idempotencyKey',
  'actionType',
  'target',
  'summary',
  'verified',
]);

export function resolveWriteCoordinationConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  contractVersion: string = WRITE_CONTRACT_VERSION,
): WriteCoordinationConfigResult {
  const envName = resolveUpstashEnvironment(env);
  const version = contractVersion.trim() || WRITE_CONTRACT_VERSION;
  return resolveUpstashRestConfig(env, `vida2:writes:${envName}:${version}`);
}

function idempotencyRedisKey(
  namespace: string,
  actorHash: string,
  actionType: string,
  idempotencyKey: string,
): string {
  const hash = coordinationKeyHash([actorHash, actionType, idempotencyKey]);
  return `${namespace}:idemp:${hash}`;
}

function leaseRedisKey(
  namespace: string,
  proposalKey: string,
  purpose: 'approve' | 'reject' | 'rollback',
): string {
  const hash = coordinationKeyHash([proposalKey, purpose]);
  return `${namespace}:lease:${hash}`;
}

/** Script: reserve first-wins; conflict on digest mismatch / in-progress; replay if final cifrado. */
const RESERVE_SCRIPT = `
local key = KEYS[1]
local digest = ARGV[1]
local ttl = tonumber(ARGV[2])
local existing = redis.call('GET', key)
if not existing then
  redis.call('SET', key, cjson.encode({state='reserved', digest=digest}), 'EX', ttl)
  return cjson.encode({status='reserved'})
end
local ok, parsed = pcall(cjson.decode, existing)
if not ok or type(parsed) ~= 'table' then
  return cjson.encode({status='conflict', reason='final'})
end
if parsed.state == 'final' and parsed.resultEncrypted then
  return cjson.encode({status='replay', resultEncrypted=parsed.resultEncrypted})
end
if parsed.state == 'final' then
  return cjson.encode({status='conflict', reason='final'})
end
if parsed.state == 'reserved' or parsed.state == 'in-progress' then
  if parsed.digest ~= digest then
    return cjson.encode({status='conflict', reason='digest-mismatch'})
  end
  return cjson.encode({status='conflict', reason='in-progress'})
end
return cjson.encode({status='conflict', reason='final'})
`;

/** Script: CAS lease acquire. Dual purpose keys prevent concurrent approve+rollback. */
const LEASE_ACQUIRE_SCRIPT = `
local key = KEYS[1]
local sibling = KEYS[2]
local token = ARGV[1]
local ttl = tonumber(ARGV[2])
if redis.call('EXISTS', sibling) == 1 then
  return cjson.encode({status='conflict'})
end
local current = redis.call('GET', key)
if current and current ~= token then
  return cjson.encode({status='conflict'})
end
redis.call('SET', key, token, 'EX', ttl)
return cjson.encode({status='acquired', token=token})
`;

const MARK_FINAL_SCRIPT = `
local key = KEYS[1]
local digest = ARGV[1]
local envelopeJson = ARGV[2]
local ttl = tonumber(ARGV[3])
local ok, envelope = pcall(cjson.decode, envelopeJson)
if not ok or type(envelope) ~= 'table' then
  return redis.error_reply('invalid-envelope')
end
redis.call('SET', key, cjson.encode({state='final', digest=digest, resultEncrypted=envelope}), 'EX', ttl)
return 'OK'
`;

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function parseActionTarget(value: unknown): ActionTarget | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'type' && key !== 'key') return undefined;
  }
  if (typeof obj.type !== 'string' || !ACTION_TARGET_TYPES.has(obj.type)) return undefined;
  if (obj.key !== null && !isBoundedString(obj.key, 200)) return undefined;
  return { type: obj.type as ActionTargetType, key: obj.key as string | null };
}

/**
 * Valida la forma mínima de un ActionResult descifrado.
 * Fail-closed: cualquier desviación → null (sin filtrar contenido).
 */
export function parseDecryptedActionResult(value: unknown): ActionResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ACTION_RESULT_KEYS.has(key)) return null;
  }
  if (typeof obj.ok !== 'boolean') return null;
  if (typeof obj.code !== 'string' || !ACTION_RESULT_CODES.has(obj.code)) return null;
  if (!isBoundedString(obj.message, 500)) return null;
  if (!isBoundedString(obj.idempotencyKey, 200) || obj.idempotencyKey.length < 1) return null;
  if (
    typeof obj.actionType !== 'string' ||
    (obj.actionType !== 'forbidden' && !isAllowedActionType(obj.actionType))
  ) {
    return null;
  }
  const target = parseActionTarget(obj.target);
  if (target === undefined) return null;
  if (obj.summary !== null && !isBoundedString(obj.summary, 500)) return null;
  if (obj.verified !== null && typeof obj.verified !== 'boolean') return null;

  return {
    ok: obj.ok,
    code: obj.code as ActionResultCode,
    message: obj.message,
    idempotencyKey: obj.idempotencyKey,
    actionType: obj.actionType as ActionResult['actionType'],
    target,
    summary: obj.summary as string | null,
    verified: obj.verified as boolean | null,
  };
}

function isValidEncryptedEnvelope(value: unknown): value is EncryptedActionResultEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'v' && key !== 'nonce' && key !== 'ciphertext' && key !== 'tag') return false;
  }
  return (
    obj.v === 1 &&
    typeof obj.nonce === 'string' &&
    typeof obj.ciphertext === 'string' &&
    typeof obj.tag === 'string' &&
    obj.nonce.length > 0 &&
    obj.nonce.length <= 64 &&
    obj.ciphertext.length > 0 &&
    obj.ciphertext.length <= ENCRYPTED_PAYLOAD_MAX_CHARS &&
    obj.tag.length > 0 &&
    obj.tag.length <= 64
  );
}

function decryptStoredActionResult(
  encryptionKey: Buffer,
  envelopeRaw: unknown,
): ActionResult | null {
  if (!isValidEncryptedEnvelope(envelopeRaw)) return null;
  const serialized = JSON.stringify(envelopeRaw);
  if (serialized.length > ENCRYPTED_PAYLOAD_MAX_CHARS) return null;
  try {
    const plaintext = decryptProposalPayload(encryptionKey, envelopeRaw);
    if (plaintext.length > ACTION_RESULT_PLAINTEXT_MAX_CHARS) return null;
    const parsed = JSON.parse(plaintext) as unknown;
    return parseDecryptedActionResult(parsed);
  } catch {
    return null;
  }
}

function encryptActionResult(
  encryptionKey: Buffer,
  result: ActionResult,
): EncryptedActionResultEnvelope {
  const plaintext = JSON.stringify(result);
  if (plaintext.length > ACTION_RESULT_PLAINTEXT_MAX_CHARS) {
    throw new Error('idempotent-result-oversize');
  }
  const envelope = encryptProposalPayload(encryptionKey, plaintext);
  const serialized = JSON.stringify(envelope);
  if (serialized.length > ENCRYPTED_PAYLOAD_MAX_CHARS) {
    throw new Error('idempotent-result-envelope-oversize');
  }
  return envelope;
}

export function createMemoryWriteCoordination(): WriteCoordinationPort & {
  clear: () => void;
} {
  type IdempRow =
    | { state: 'reserved' | 'in-progress'; digest: string; expiresAt: number }
    | { state: 'final'; digest: string; result: ActionResult; expiresAt: number };
  const idempotency = new Map<string, IdempRow>();
  const leases = new Map<string, { token: string; expiresAt: number }>();

  function idempKey(actorHash: string, actionType: string, idempotencyKey: string): string {
    return coordinationKeyHash([actorHash, actionType, idempotencyKey]);
  }

  function leaseKey(proposalKey: string, purpose: string): string {
    return coordinationKeyHash([proposalKey, purpose]);
  }

  function siblingPurpose(
    purpose: 'approve' | 'reject' | 'rollback',
  ): 'approve' | 'reject' | 'rollback' {
    if (purpose === 'rollback') return 'approve';
    if (purpose === 'approve') return 'rollback';
    return 'approve';
  }

  return {
    clear() {
      idempotency.clear();
      leases.clear();
    },
    async reserveIdempotency(input) {
      const key = idempKey(input.actorHash, input.actionType, input.idempotencyKey);
      const now = Date.now();
      const existing = idempotency.get(key);
      if (existing && existing.expiresAt < now) {
        idempotency.delete(key);
      }
      const row = idempotency.get(key);
      if (!row) {
        idempotency.set(key, {
          state: 'reserved',
          digest: input.payloadDigest,
          expiresAt: now + input.ttlSeconds * 1000,
        });
        return { status: 'reserved' };
      }
      if (row.state === 'final') {
        return { status: 'replay', result: row.result };
      }
      if (row.digest !== input.payloadDigest) {
        return { status: 'conflict', reason: 'digest-mismatch' };
      }
      return { status: 'conflict', reason: 'in-progress' };
    },
    async getIdempotentResult(input) {
      const key = idempKey(input.actorHash, input.actionType, input.idempotencyKey);
      const row = idempotency.get(key);
      if (!row || row.expiresAt < Date.now()) return null;
      return row.state === 'final' ? row.result : null;
    },
    async acquireProposalLease(input) {
      const key = leaseKey(input.proposalKey, input.purpose);
      const sibling = leaseKey(input.proposalKey, siblingPurpose(input.purpose));
      const now = Date.now();
      const sib = leases.get(sibling);
      if (sib && sib.expiresAt >= now) return { status: 'conflict' };
      const current = leases.get(key);
      if (current && current.expiresAt >= now) return { status: 'conflict' };
      const token = coordinationKeyHash([input.proposalKey, input.purpose, String(now)]);
      leases.set(key, { token, expiresAt: now + input.ttlSeconds * 1000 });
      return { status: 'acquired', token };
    },
    async releaseProposalLease(input) {
      const key = leaseKey(input.proposalKey, input.purpose);
      const current = leases.get(key);
      if (current && current.token === input.token) {
        leases.delete(key);
      }
    },
    async markFinal(input) {
      const key = idempKey(input.actorHash, input.actionType, input.idempotencyKey);
      idempotency.set(key, {
        state: 'final',
        digest: input.payloadDigest,
        result: input.result,
        expiresAt: Date.now() + input.ttlSeconds * 1000,
      });
    },
  };
}

/**
 * Coordinación Upstash: digests/estados en claro; ActionResult solo como envelope cifrado.
 */
export function createUpstashWriteCoordination(
  config: WriteCoordinationConfig,
  encryptionKey: Buffer,
  fetchImpl: WriteRedisFetch = fetch,
): WriteCoordinationPort {
  if (encryptionKey.length !== 32) {
    throw new Error('write-coordination-encryption-key-invalid');
  }

  return {
    async reserveIdempotency(input) {
      const key = idempotencyRedisKey(
        config.namespace,
        input.actorHash,
        input.actionType,
        input.idempotencyKey,
      );
      const raw = await evalRedisScript(
        config,
        RESERVE_SCRIPT,
        [key],
        [input.payloadDigest, input.ttlSeconds],
        fetchImpl,
      );
      const parsed = parseJsonObject(raw);
      if (!parsed || typeof parsed.status !== 'string') {
        throw new Error('write-coordination-unavailable');
      }
      if (parsed.status === 'reserved') return { status: 'reserved' };
      if (parsed.status === 'replay') {
        const result = decryptStoredActionResult(encryptionKey, parsed.resultEncrypted);
        if (!result) {
          return { status: 'conflict', reason: 'final' };
        }
        return { status: 'replay', result };
      }
      const reason =
        parsed.reason === 'digest-mismatch' || parsed.reason === 'in-progress'
          ? parsed.reason
          : 'final';
      return { status: 'conflict', reason };
    },
    async getIdempotentResult(input) {
      try {
        const key = idempotencyRedisKey(
          config.namespace,
          input.actorHash,
          input.actionType,
          input.idempotencyKey,
        );
        const raw = await executeRedisCommand(config, ['GET', key], fetchImpl);
        if (typeof raw !== 'string' || !raw) return null;
        if (raw.length > ENCRYPTED_PAYLOAD_MAX_CHARS * 2) return null;
        const parsed = parseJsonObject(raw);
        if (!parsed || parsed.state !== 'final') return null;
        if ('result' in parsed && !('resultEncrypted' in parsed)) {
          // Formato legado plaintext: fail-closed sin devolver contenido.
          return null;
        }
        return decryptStoredActionResult(encryptionKey, parsed.resultEncrypted);
      } catch {
        return null;
      }
    },
    async acquireProposalLease(input) {
      try {
        const key = leaseRedisKey(config.namespace, input.proposalKey, input.purpose);
        const siblingPurpose =
          input.purpose === 'rollback'
            ? 'approve'
            : input.purpose === 'approve'
              ? 'rollback'
              : 'approve';
        const sibling = leaseRedisKey(config.namespace, input.proposalKey, siblingPurpose);
        const token = coordinationKeyHash([
          input.proposalKey,
          input.purpose,
          String(Date.now()),
          Math.random().toString(36),
        ]);
        const raw = await evalRedisScript(
          config,
          LEASE_ACQUIRE_SCRIPT,
          [key, sibling],
          [token, input.ttlSeconds],
          fetchImpl,
        );
        const parsed = parseJsonObject(raw);
        if (!parsed) return { status: 'unavailable' };
        if (parsed.status === 'acquired' && typeof parsed.token === 'string') {
          return { status: 'acquired', token: parsed.token };
        }
        return { status: 'conflict' };
      } catch {
        return { status: 'unavailable' };
      }
    },
    async releaseProposalLease(input) {
      const key = leaseRedisKey(config.namespace, input.proposalKey, input.purpose);
      const current = await executeRedisCommand(config, ['GET', key], fetchImpl);
      if (current === input.token) {
        await executeRedisCommand(config, ['DEL', key], fetchImpl);
      }
    },
    async markFinal(input) {
      const key = idempotencyRedisKey(
        config.namespace,
        input.actorHash,
        input.actionType,
        input.idempotencyKey,
      );
      const envelope = encryptActionResult(encryptionKey, input.result);
      const ttl = Math.max(1, Math.floor(input.ttlSeconds));
      await evalRedisScript(
        config,
        MARK_FINAL_SCRIPT,
        [key],
        [input.payloadDigest, JSON.stringify(envelope), ttl],
        fetchImpl,
      );
    },
  };
}
