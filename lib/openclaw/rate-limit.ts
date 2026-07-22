/**
 * Rate limit local (tests) / cerrado por defecto en Preview sin proveedor persistente.
 */
export type OpenClawRateLimitPort = {
  allow(key: string, limitPerMinute: number): Promise<{ ok: true } | { ok: false }>;
};

/** Implementación en memoria para tests / local. No es garantía distribuida. */
export function createMemoryOpenClawRateLimitPort(): OpenClawRateLimitPort {
  const hits = new Map<string, number[]>();
  return {
    async allow(key, limitPerMinute) {
      const now = Date.now();
      const windowStart = now - 60_000;
      const prev = (hits.get(key) ?? []).filter((ts) => ts >= windowStart);
      if (prev.length >= limitPerMinute) {
        hits.set(key, prev);
        return { ok: false };
      }
      prev.push(now);
      hits.set(key, prev);
      return { ok: true };
    },
  };
}

/**
 * Puerto cerrado: no afirma rate limiting distribuido.
 * Las rutas siguen aplicando límites de payload/concurrencia.
 */
export function createClosedOpenClawRateLimitPort(): OpenClawRateLimitPort {
  return {
    async allow() {
      return { ok: true };
    },
  };
}

export function resolveOpenClawRateLimitPort(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawRateLimitPort {
  if (env.OPENCLAW_RATE_LIMIT_MODE === 'memory' || env.NODE_ENV === 'test') {
    return createMemoryOpenClawRateLimitPort();
  }
  return createClosedOpenClawRateLimitPort();
}
