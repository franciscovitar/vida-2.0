/**
 * Coordinación distribuida de escrituras (idempotencia + leases).
 * Namespace separado de OpenClaw: vida2:writes:<env>:<contractVersion>
 */
import { coordinationKeyHash } from '@/lib/actions/opaque';
import { WRITE_CONTRACT_VERSION } from '@/types/actions';
import type { ActionResult } from '@/types/actions';

export type WriteCoordinationConfig = {
  url: string;
  token: string;
  namespace: string;
  timeoutMs: number;
};

export type WriteCoordinationConfigResult =
  { ok: true; value: WriteCoordinationConfig } | { ok: false };

export type WriteRedisFetch = typeof fetch;
export type WriteRedisCommandPart = string | number;

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

const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_RESPONSE_CHARS = 16 * 1024;
const ENVIRONMENT_PATTERN = /^(development|preview|production|test)$/;

function resolveEnvironment(env: Readonly<Record<string, string | undefined>>): string {
  const candidate = env.VERCEL_ENV ?? env.NODE_ENV ?? 'unknown';
  return ENVIRONMENT_PATTERN.test(candidate) ? candidate : 'unknown';
}

function normalizeUpstashUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    if (!url.hostname.endsWith('.upstash.io') || url.hostname === 'upstash.io') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveWriteCoordinationConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  contractVersion: string = WRITE_CONTRACT_VERSION,
): WriteCoordinationConfigResult {
  const rawUrl = env.UPSTASH_REDIS_REST_URL ?? '';
  const rawToken = env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const url = normalizeUpstashUrl(rawUrl);
  const token = rawToken.trim();

  if (!url || !token || token !== rawToken || token.length < 16 || /\s/.test(token)) {
    return { ok: false };
  }

  const envName = resolveEnvironment(env);
  const version = contractVersion.trim() || WRITE_CONTRACT_VERSION;

  return {
    ok: true,
    value: {
      url,
      token,
      namespace: `vida2:writes:${envName}:${version}`,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
  };
}

async function executeWriteRedisCommand(
  config: WriteCoordinationConfig,
  command: readonly WriteRedisCommandPart[],
  fetchImpl: WriteRedisFetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) throw new Error('write-coordination-unavailable');

    const raw = await response.text();
    if (!raw || raw.length > MAX_RESPONSE_CHARS) {
      throw new Error('write-coordination-unavailable');
    }

    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      'error' in parsed ||
      !('result' in parsed)
    ) {
      throw new Error('write-coordination-unavailable');
    }

    return (parsed as { result: unknown }).result;
  } catch {
    throw new Error('write-coordination-unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function evalWriteRedisScript(
  config: WriteCoordinationConfig,
  script: string,
  keys: readonly string[],
  args: readonly WriteRedisCommandPart[],
  fetchImpl: WriteRedisFetch = fetch,
): Promise<unknown> {
  return executeWriteRedisCommand(
    config,
    ['EVAL', script, keys.length, ...keys, ...args],
    fetchImpl,
  );
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

/** Script: reserve first-wins; conflict on digest mismatch / in-progress; replay if final. */
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
if parsed.state == 'final' and parsed.result then
  return cjson.encode({status='replay', result=parsed.result})
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
local resultJson = ARGV[2]
local ttl = tonumber(ARGV[3])
redis.call('SET', key, cjson.encode({state='final', digest=digest, result=cjson.decode(resultJson)}), 'EX', ttl)
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

export function createUpstashWriteCoordination(
  config: WriteCoordinationConfig,
  fetchImpl: WriteRedisFetch = fetch,
): WriteCoordinationPort {
  return {
    async reserveIdempotency(input) {
      const key = idempotencyRedisKey(
        config.namespace,
        input.actorHash,
        input.actionType,
        input.idempotencyKey,
      );
      const raw = await evalWriteRedisScript(
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
      if (parsed.status === 'replay' && parsed.result) {
        return { status: 'replay', result: parsed.result as ActionResult };
      }
      const reason =
        parsed.reason === 'digest-mismatch' || parsed.reason === 'in-progress'
          ? parsed.reason
          : 'final';
      return { status: 'conflict', reason };
    },
    async getIdempotentResult(input) {
      const key = idempotencyRedisKey(
        config.namespace,
        input.actorHash,
        input.actionType,
        input.idempotencyKey,
      );
      const raw = await executeWriteRedisCommand(config, ['GET', key], fetchImpl);
      if (typeof raw !== 'string' || !raw) return null;
      const parsed = parseJsonObject(raw);
      if (!parsed || parsed.state !== 'final' || !parsed.result) return null;
      return parsed.result as ActionResult;
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
        const raw = await evalWriteRedisScript(
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
      const current = await executeWriteRedisCommand(config, ['GET', key], fetchImpl);
      if (current === input.token) {
        await executeWriteRedisCommand(config, ['DEL', key], fetchImpl);
      }
    },
    async markFinal(input) {
      const key = idempotencyRedisKey(
        config.namespace,
        input.actorHash,
        input.actionType,
        input.idempotencyKey,
      );
      await evalWriteRedisScript(
        config,
        MARK_FINAL_SCRIPT,
        [key],
        [input.payloadDigest, JSON.stringify(input.result), input.ttlSeconds],
        fetchImpl,
      );
    },
  };
}
