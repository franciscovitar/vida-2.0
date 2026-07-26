import {
  evalOpenClawRedisScript,
  resolveOpenClawSecurityStoreConfig,
  type OpenClawRedisFetch,
  type OpenClawSecurityStoreConfig,
} from '@/lib/openclaw/security-store';
import type { OpenClawReplayKeys } from '@/types/openclaw';

export type OpenClawReplayReservation =
  | { ok: true }
  | {
      ok: false;
      reason: 'replay-detected' | 'security-control-unavailable';
    };

export interface OpenClawReplayPort {
  reserve(
    keys: OpenClawReplayKeys,
    ttlSeconds: number,
    nowMs?: number,
  ): Promise<OpenClawReplayReservation>;
}

const REPLAY_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end
redis.call("SET", KEYS[1], "1", "EX", ARGV[1])
redis.call("SET", KEYS[2], "1", "EX", ARGV[1])
return 1
`;

export function createMemoryOpenClawReplayPort(): OpenClawReplayPort {
  const expirations = new Map<string, number>();

  return {
    async reserve(keys, ttlSeconds, nowMs = Date.now()) {
      const ttlMs = ttlSeconds * 1000;
      if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
        return { ok: false, reason: 'security-control-unavailable' };
      }

      for (const [key, expiresAt] of expirations) {
        if (expiresAt <= nowMs) expirations.delete(key);
      }

      if (expirations.has(keys.requestKey) || expirations.has(keys.canonicalKey)) {
        return { ok: false, reason: 'replay-detected' };
      }

      const expiresAt = nowMs + ttlMs;
      expirations.set(keys.requestKey, expiresAt);
      expirations.set(keys.canonicalKey, expiresAt);
      return { ok: true };
    },
  };
}

export function createUnavailableOpenClawReplayPort(): OpenClawReplayPort {
  return {
    async reserve() {
      return { ok: false, reason: 'security-control-unavailable' };
    },
  };
}

export function createUpstashOpenClawReplayPort(
  config: OpenClawSecurityStoreConfig,
  fetchImpl: OpenClawRedisFetch = fetch,
): OpenClawReplayPort {
  return {
    async reserve(keys, ttlSeconds) {
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
        return { ok: false, reason: 'security-control-unavailable' };
      }

      const requestKey = `${config.namespace}:replay:request:${keys.requestKey}`;
      const canonicalKey = `${config.namespace}:replay:canonical:${keys.canonicalKey}`;

      try {
        const result = await evalOpenClawRedisScript(
          config,
          REPLAY_SCRIPT,
          [requestKey, canonicalKey],
          [ttlSeconds],
          fetchImpl,
        );

        if (result === 1) return { ok: true };
        if (result === 0) return { ok: false, reason: 'replay-detected' };
        return { ok: false, reason: 'security-control-unavailable' };
      } catch {
        return { ok: false, reason: 'security-control-unavailable' };
      }
    },
  };
}

const memoryReplayPort = createMemoryOpenClawReplayPort();
const unavailableReplayPort = createUnavailableOpenClawReplayPort();

export function resolveOpenClawReplayPort(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawReplayPort {
  const mode = env.OPENCLAW_REPLAY_MODE?.trim();

  if (env.VERCEL_ENV) {
    if (mode !== 'upstash') return unavailableReplayPort;
    const config = resolveOpenClawSecurityStoreConfig(env);
    return config.ok ? createUpstashOpenClawReplayPort(config.value) : unavailableReplayPort;
  }

  if (env.NODE_ENV === 'test') return memoryReplayPort;
  if (mode === 'memory' && env.NODE_ENV !== 'production') {
    return memoryReplayPort;
  }

  if (mode === 'upstash') {
    const config = resolveOpenClawSecurityStoreConfig(env);
    if (config.ok) return createUpstashOpenClawReplayPort(config.value);
  }

  return unavailableReplayPort;
}
