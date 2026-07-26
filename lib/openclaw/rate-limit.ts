import { createHash } from 'node:crypto';

import {
  evalOpenClawRedisScript,
  resolveOpenClawSecurityStoreConfig,
  type OpenClawRedisFetch,
  type OpenClawSecurityStoreConfig,
} from '@/lib/openclaw/security-store';

export type OpenClawRateLimitDecision =
  | { ok: true }
  | {
      ok: false;
      reason: 'rate-limited' | 'security-control-unavailable';
    };

export type OpenClawRateLimitPort = {
  allow(key: string, limitPerMinute: number, nowMs?: number): Promise<OpenClawRateLimitDecision>;
};

const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
if current > tonumber(ARGV[1]) then
  return 0
end
return 1
`;

function opaqueKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Implementación en memoria para tests / local. No es garantía distribuida. */
export function createMemoryOpenClawRateLimitPort(): OpenClawRateLimitPort {
  const hits = new Map<string, number[]>();

  return {
    async allow(key, limitPerMinute, nowMs = Date.now()) {
      if (!Number.isSafeInteger(limitPerMinute) || limitPerMinute <= 0) {
        return { ok: false, reason: 'security-control-unavailable' };
      }

      const windowStart = nowMs - 60_000;
      const prev = (hits.get(key) ?? []).filter((ts) => ts >= windowStart);
      if (prev.length >= limitPerMinute) {
        hits.set(key, prev);
        return { ok: false, reason: 'rate-limited' };
      }

      prev.push(nowMs);
      hits.set(key, prev);
      return { ok: true };
    },
  };
}

export function createUnavailableOpenClawRateLimitPort(): OpenClawRateLimitPort {
  return {
    async allow() {
      return { ok: false, reason: 'security-control-unavailable' };
    },
  };
}

export function createUpstashOpenClawRateLimitPort(
  config: OpenClawSecurityStoreConfig,
  fetchImpl: OpenClawRedisFetch = fetch,
): OpenClawRateLimitPort {
  return {
    async allow(key, limitPerMinute, nowMs = Date.now()) {
      if (
        !Number.isSafeInteger(limitPerMinute) ||
        limitPerMinute <= 0 ||
        !Number.isSafeInteger(nowMs) ||
        nowMs < 0
      ) {
        return { ok: false, reason: 'security-control-unavailable' };
      }

      const minuteBucket = Math.floor(nowMs / 60_000);
      const redisKey = `${config.namespace}:rate:${opaqueKey(key)}:${minuteBucket}`;

      try {
        const result = await evalOpenClawRedisScript(
          config,
          RATE_LIMIT_SCRIPT,
          [redisKey],
          [limitPerMinute, 120],
          fetchImpl,
        );

        if (result === 1) return { ok: true };
        if (result === 0) return { ok: false, reason: 'rate-limited' };
        return { ok: false, reason: 'security-control-unavailable' };
      } catch {
        return { ok: false, reason: 'security-control-unavailable' };
      }
    },
  };
}

const memoryRateLimitPort = createMemoryOpenClawRateLimitPort();
const unavailableRateLimitPort = createUnavailableOpenClawRateLimitPort();

export function resolveOpenClawRateLimitPort(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawRateLimitPort {
  const mode = env.OPENCLAW_RATE_LIMIT_MODE?.trim();

  if (env.NODE_ENV === 'test') return memoryRateLimitPort;
  if (mode === 'memory' && env.NODE_ENV !== 'production' && !env.VERCEL_ENV) {
    return memoryRateLimitPort;
  }

  if (mode === 'upstash') {
    const config = resolveOpenClawSecurityStoreConfig(env);
    if (config.ok) return createUpstashOpenClawRateLimitPort(config.value);
  }

  return unavailableRateLimitPort;
}
