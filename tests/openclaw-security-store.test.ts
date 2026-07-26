import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMemoryOpenClawRateLimitPort,
  createUpstashOpenClawRateLimitPort,
  resolveOpenClawRateLimitPort,
} from '@/lib/openclaw/rate-limit';
import { createUpstashOpenClawReplayPort, resolveOpenClawReplayPort } from '@/lib/openclaw/replay';
import {
  resolveOpenClawSecurityStoreConfig,
  type OpenClawRedisFetch,
  type OpenClawSecurityStoreConfig,
} from '@/lib/openclaw/security-store';

const CONFIG: OpenClawSecurityStoreConfig = {
  url: 'https://example-test.upstash.io',
  token: 'test_token_1234567890',
  namespace: 'vida2:openclaw:test',
  timeoutMs: 1_000,
};

function redisFetch(
  result: unknown,
  calls: Array<{ url: string; init: RequestInit }>,
): OpenClawRedisFetch {
  return async (input, init) => {
    calls.push({
      url: String(input),
      init: init ?? {},
    });
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

test('openclaw store: configuración acepta solo endpoint Upstash HTTPS limpio', () => {
  const valid = resolveOpenClawSecurityStoreConfig({
    NODE_ENV: 'test',
    UPSTASH_REDIS_REST_URL: CONFIG.url,
    UPSTASH_REDIS_REST_TOKEN: CONFIG.token,
  });
  assert.equal(valid.ok, true);

  for (const url of [
    'http://example-test.upstash.io',
    'https://upstash.io',
    'https://evil.example.com',
    'https://example-test.upstash.io/path',
    'https://example-test.upstash.io?token=x',
  ]) {
    assert.equal(
      resolveOpenClawSecurityStoreConfig({
        UPSTASH_REDIS_REST_URL: url,
        UPSTASH_REDIS_REST_TOKEN: CONFIG.token,
      }).ok,
      false,
    );
  }
});

test('openclaw store: token ausente, corto o con espacios falla cerrado', () => {
  for (const token of ['', 'short', ` ${CONFIG.token}`, `${CONFIG.token}\n`]) {
    assert.equal(
      resolveOpenClawSecurityStoreConfig({
        UPSTASH_REDIS_REST_URL: CONFIG.url,
        UPSTASH_REDIS_REST_TOKEN: token,
      }).ok,
      false,
    );
  }
});

test('openclaw store: replay distribuido usa un EVAL atómico y claves opacas', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const port = createUpstashOpenClawReplayPort(CONFIG, redisFetch(1, calls));
  const result = await port.reserve(
    {
      requestKey: 'a'.repeat(64),
      canonicalKey: 'b'.repeat(64),
    },
    900,
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  const command = JSON.parse(String(calls[0]?.init.body)) as unknown[];
  assert.equal(command[0], 'EVAL');
  assert.match(String(command[1]), /EXISTS/);
  assert.match(String(command[1]), /SET/);
  assert.equal(command[2], 2);
  assert.match(String(command[3]), /^vida2:openclaw:test:replay:request:[0-9a-f]{64}$/);
  assert.match(String(command[4]), /^vida2:openclaw:test:replay:canonical:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(command).includes(CONFIG.token), false);
});

test('openclaw store: replay remoto distingue duplicado de caída', async () => {
  const duplicate = createUpstashOpenClawReplayPort(CONFIG, redisFetch(0, []));
  assert.deepEqual(
    await duplicate.reserve({ requestKey: 'a'.repeat(64), canonicalKey: 'b'.repeat(64) }, 900),
    { ok: false, reason: 'replay-detected' },
  );

  const unavailable = createUpstashOpenClawReplayPort(CONFIG, async () => {
    throw new Error('network');
  });
  assert.deepEqual(
    await unavailable.reserve({ requestKey: 'a'.repeat(64), canonicalKey: 'b'.repeat(64) }, 900),
    { ok: false, reason: 'security-control-unavailable' },
  );
});

test('openclaw store: rate limit distribuido usa EVAL y bucket por minuto', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const port = createUpstashOpenClawRateLimitPort(CONFIG, redisFetch(1, calls));

  assert.deepEqual(await port.allow('oc_key', 60, 120_000), { ok: true });
  assert.deepEqual(await port.allow('oc_key', 60, 179_999), { ok: true });
  assert.deepEqual(await port.allow('oc_key', 60, 180_000), { ok: true });

  const keys = calls.map((call) => {
    const command = JSON.parse(String(call.init.body)) as unknown[];
    assert.equal(command[0], 'EVAL');
    assert.match(String(command[1]), /INCR/);
    assert.match(String(command[1]), /EXPIRE/);
    return String(command[3]);
  });

  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
  assert.equal(
    keys.some((key) => key.includes('oc_key')),
    false,
  );
});

test('openclaw store: rate limit remoto distingue límite de caída', async () => {
  const limited = createUpstashOpenClawRateLimitPort(CONFIG, redisFetch(0, []));
  assert.deepEqual(await limited.allow('k', 1), {
    ok: false,
    reason: 'rate-limited',
  });

  const unavailable = createUpstashOpenClawRateLimitPort(CONFIG, async () => {
    return new Response(JSON.stringify({ error: 'ERR' }), { status: 200 });
  });
  assert.deepEqual(await unavailable.allow('k', 1), {
    ok: false,
    reason: 'security-control-unavailable',
  });
});

test('openclaw store: memoria local conserva límite entre llamadas', async () => {
  const port = createMemoryOpenClawRateLimitPort();
  assert.deepEqual(await port.allow('k', 2, 1_000), { ok: true });
  assert.deepEqual(await port.allow('k', 2, 1_001), { ok: true });
  assert.deepEqual(await port.allow('k', 2, 1_002), {
    ok: false,
    reason: 'rate-limited',
  });
});

test('openclaw store: Preview sin configuración distribuida falla cerrado', async () => {
  const env = {
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'upstash',
    OPENCLAW_REPLAY_MODE: 'upstash',
  };

  assert.deepEqual(await resolveOpenClawRateLimitPort(env).allow('k', 60), {
    ok: false,
    reason: 'security-control-unavailable',
  });
  assert.deepEqual(
    await resolveOpenClawReplayPort(env).reserve(
      { requestKey: 'a'.repeat(64), canonicalKey: 'b'.repeat(64) },
      900,
    ),
    { ok: false, reason: 'security-control-unavailable' },
  );
});

test('openclaw store: Vercel nunca selecciona memoria aunque NODE_ENV sea test', async () => {
  const env = {
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    OPENCLAW_RATE_LIMIT_MODE: 'memory',
    OPENCLAW_REPLAY_MODE: 'memory',
  };

  assert.deepEqual(await resolveOpenClawRateLimitPort(env).allow('k', 60), {
    ok: false,
    reason: 'security-control-unavailable',
  });
  assert.deepEqual(
    await resolveOpenClawReplayPort(env).reserve(
      { requestKey: 'a'.repeat(64), canonicalKey: 'b'.repeat(64) },
      900,
    ),
    { ok: false, reason: 'security-control-unavailable' },
  );
});

test('openclaw store: Authorization queda solo en header y nunca en URL/body', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const port = createUpstashOpenClawRateLimitPort(CONFIG, redisFetch(1, calls));
  await port.allow('k', 60, 1_000);

  const call = calls[0];
  assert.equal(call?.url, CONFIG.url);
  assert.equal(call?.url.includes(CONFIG.token), false);
  assert.equal(String(call?.init.body).includes(CONFIG.token), false);

  const headers = new Headers(call?.init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${CONFIG.token}`);
  assert.equal(call?.init.cache, 'no-store');
  assert.equal(call?.init.redirect, 'error');
});
