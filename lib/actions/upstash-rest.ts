/**
 * Shared Upstash Redis REST executor (writes coordination + encrypted payload store).
 * Fail-closed: invalid URL/token, timeouts, oversized responses → errors.
 */
export type UpstashRestConfig = {
  url: string;
  token: string;
  namespace: string;
  timeoutMs: number;
};

export type UpstashRestConfigResult = { ok: true; value: UpstashRestConfig } | { ok: false };

export type UpstashRedisFetch = typeof fetch;
export type UpstashRedisCommandPart = string | number;

export const UPSTASH_DEFAULT_TIMEOUT_MS = 3_000;
export const UPSTASH_MAX_RESPONSE_CHARS = 16 * 1024;

const ENVIRONMENT_PATTERN = /^(development|preview|production|test)$/;

export function resolveUpstashEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const candidate = env.VERCEL_ENV ?? env.NODE_ENV ?? 'unknown';
  return ENVIRONMENT_PATTERN.test(candidate) ? candidate : 'unknown';
}

export function normalizeUpstashUrl(raw: string): string | null {
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

export function resolveUpstashRestConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  namespace: string,
  timeoutMs: number = UPSTASH_DEFAULT_TIMEOUT_MS,
): UpstashRestConfigResult {
  const rawUrl = env.UPSTASH_REDIS_REST_URL ?? '';
  const rawToken = env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const url = normalizeUpstashUrl(rawUrl);
  const token = rawToken.trim();

  if (!url || !token || token !== rawToken || token.length < 16 || /\s/.test(token)) {
    return { ok: false };
  }

  const ns = namespace.trim();
  if (!ns) return { ok: false };

  return {
    ok: true,
    value: {
      url,
      token,
      namespace: ns,
      timeoutMs,
    },
  };
}

export async function executeRedisCommand(
  config: UpstashRestConfig,
  command: readonly UpstashRedisCommandPart[],
  fetchImpl: UpstashRedisFetch = fetch,
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

    if (!response.ok) throw new Error('upstash-unavailable');

    const raw = await response.text();
    if (!raw || raw.length > UPSTASH_MAX_RESPONSE_CHARS) {
      throw new Error('upstash-unavailable');
    }

    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      'error' in parsed ||
      !('result' in parsed)
    ) {
      throw new Error('upstash-unavailable');
    }

    return (parsed as { result: unknown }).result;
  } catch {
    throw new Error('upstash-unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function evalRedisScript(
  config: UpstashRestConfig,
  script: string,
  keys: readonly string[],
  args: readonly UpstashRedisCommandPart[],
  fetchImpl: UpstashRedisFetch = fetch,
): Promise<unknown> {
  return executeRedisCommand(config, ['EVAL', script, keys.length, ...keys, ...args], fetchImpl);
}
