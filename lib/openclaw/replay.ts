import type { OpenClawReplayKeys } from '@/types/openclaw';

export type OpenClawReplayReservation =
  { ok: true } | { ok: false; reason: 'replay-detected' | 'security-control-unavailable' };

export interface OpenClawReplayPort {
  reserve(
    keys: OpenClawReplayKeys,
    ttlSeconds: number,
    nowMs?: number,
  ): Promise<OpenClawReplayReservation>;
}

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

const memoryReplayPort = createMemoryOpenClawReplayPort();
const unavailableReplayPort = createUnavailableOpenClawReplayPort();

export function resolveOpenClawReplayPort(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawReplayPort {
  const mode = env.OPENCLAW_REPLAY_MODE?.trim();

  if (env.NODE_ENV === 'test') return memoryReplayPort;
  if (mode === 'memory' && env.NODE_ENV !== 'production' && !env.VERCEL_ENV) {
    return memoryReplayPort;
  }

  return unavailableReplayPort;
}
