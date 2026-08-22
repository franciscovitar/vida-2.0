export type OpenClawSecurityStoreConfig = {
  url: string;
  token: string;
  namespace: string;
  timeoutMs: number;
};

export type OpenClawSecurityStoreConfigResult =
  { ok: true; value: OpenClawSecurityStoreConfig } | { ok: false };

export type OpenClawRedisCommandPart = string | number;
export type OpenClawRedisFetch = typeof fetch;

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

export function resolveOpenClawSecurityStoreConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawSecurityStoreConfigResult {
  const rawUrl = env.UPSTASH_REDIS_REST_URL ?? '';
  const rawToken = env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const url = normalizeUpstashUrl(rawUrl);
  const token = rawToken.trim();

  if (!url || !token || token !== rawToken || token.length < 16 || /\s/.test(token)) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      url,
      token,
      namespace: `vida2:openclaw:${resolveEnvironment(env)}`,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
  };
}

export async function executeOpenClawRedisCommand(
  config: OpenClawSecurityStoreConfig,
  command: readonly OpenClawRedisCommandPart[],
  fetchImpl: OpenClawRedisFetch = fetch,
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

    if (!response.ok) throw new Error('security-store-unavailable');

    const raw = await response.text();
    if (!raw || raw.length > MAX_RESPONSE_CHARS) {
      throw new Error('security-store-unavailable');
    }

    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      'error' in parsed ||
      !('result' in parsed)
    ) {
      throw new Error('security-store-unavailable');
    }

    return (parsed as { result: unknown }).result;
  } catch {
    throw new Error('security-store-unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function evalOpenClawRedisScript(
  config: OpenClawSecurityStoreConfig,
  script: string,
  keys: readonly string[],
  args: readonly OpenClawRedisCommandPart[],
  fetchImpl: OpenClawRedisFetch = fetch,
): Promise<unknown> {
  return executeOpenClawRedisCommand(
    config,
    ['EVAL', script, keys.length, ...keys, ...args],
    fetchImpl,
  );
}
