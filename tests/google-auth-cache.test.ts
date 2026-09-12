import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import { fetchAccessToken } from '@/lib/google/auth';

function privateKey(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

test('deduplica intercambios concurrentes y reutiliza el access token vigente por cuenta/scope', async () => {
  const originalFetch = globalThis.fetch;
  const key = privateKey();
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ access_token: `token-${calls}`, expires_in: 3600 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const [first, second] = await Promise.all([
      fetchAccessToken('media-cache@example.test', key, 'scope:readonly'),
      fetchAccessToken('media-cache@example.test', key, 'scope:readonly'),
    ]);
    assert.deepEqual(first, { ok: true, token: 'token-1' });
    assert.deepEqual(second, { ok: true, token: 'token-1' });
    assert.equal(calls, 1);

    const cached = await fetchAccessToken('media-cache@example.test', key, 'scope:readonly');
    assert.deepEqual(cached, { ok: true, token: 'token-1' });
    assert.equal(calls, 1);

    const differentScope = await fetchAccessToken('media-cache@example.test', key, 'scope:write');
    assert.deepEqual(differentScope, { ok: true, token: 'token-2' });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('no cachea respuestas fallidas del endpoint de token', async () => {
  const originalFetch = globalThis.fetch;
  const key = privateKey();
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) return new Response('temporary failure', { status: 500 });
    return new Response(JSON.stringify({ access_token: 'recovered', expires_in: 3600 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const failed = await fetchAccessToken('media-retry@example.test', key, 'scope:readonly');
    assert.deepEqual(failed, { ok: false, code: 'auth-error' });

    const recovered = await fetchAccessToken('media-retry@example.test', key, 'scope:readonly');
    assert.deepEqual(recovered, { ok: true, token: 'recovered' });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
