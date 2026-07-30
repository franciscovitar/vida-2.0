import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { buildOpenClawReplayKeys } from '@/lib/openclaw/auth';
import { OPENCLAW_REPLAY_TTL_SECONDS } from '@/lib/openclaw/config';
import {
  createMemoryOpenClawReplayPort,
  createUnavailableOpenClawReplayPort,
  resolveOpenClawReplayPort,
} from '@/lib/openclaw/replay';

const baseKeys = buildOpenClawReplayKeys({
  environment: 'test',
  agentId: 'steward',
  requestId: 'req-1',
  signature: 'a'.repeat(64),
});

test('openclaw replay: fingerprints son opacos, separados y determinÃ­sticos', () => {
  const repeated = buildOpenClawReplayKeys({
    environment: 'test',
    agentId: 'steward',
    requestId: 'req-1',
    signature: 'a'.repeat(64),
  });

  assert.deepEqual(repeated, baseKeys);
  assert.match(baseKeys.requestKey, /^[0-9a-f]{64}$/);
  assert.match(baseKeys.canonicalKey, /^[0-9a-f]{64}$/);
  assert.notEqual(baseKeys.requestKey, baseKeys.canonicalKey);
  assert.equal(JSON.stringify(baseKeys).includes('steward'), false);
  assert.equal(JSON.stringify(baseKeys).includes('req-1'), false);
});

test('openclaw replay: primera reserva pasa y repeticiÃ³n exacta se bloquea', async () => {
  const port = createMemoryOpenClawReplayPort();
  const first = await port.reserve(baseKeys, OPENCLAW_REPLAY_TTL_SECONDS, 1_000);
  const second = await port.reserve(baseKeys, OPENCLAW_REPLAY_TTL_SECONDS, 1_001);

  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: false, reason: 'replay-detected' });
});

test('openclaw replay: mismo request ID con otra firma se bloquea', async () => {
  const port = createMemoryOpenClawReplayPort();
  const changedCanonical = {
    requestKey: baseKeys.requestKey,
    canonicalKey: 'b'.repeat(64),
  };

  assert.deepEqual(await port.reserve(baseKeys, 900, 1_000), { ok: true });
  assert.deepEqual(await port.reserve(changedCanonical, 900, 1_001), {
    ok: false,
    reason: 'replay-detected',
  });
});

test('openclaw replay: misma firma con otro request ID se bloquea', async () => {
  const port = createMemoryOpenClawReplayPort();
  const changedRequest = {
    requestKey: 'c'.repeat(64),
    canonicalKey: baseKeys.canonicalKey,
  };

  assert.deepEqual(await port.reserve(baseKeys, 900, 1_000), { ok: true });
  assert.deepEqual(await port.reserve(changedRequest, 900, 1_001), {
    ok: false,
    reason: 'replay-detected',
  });
});

test('openclaw replay: TTL permite una nueva reserva despuÃ©s de expirar', async () => {
  const port = createMemoryOpenClawReplayPort();

  assert.deepEqual(await port.reserve(baseKeys, 1, 1_000), { ok: true });
  assert.deepEqual(await port.reserve(baseKeys, 1, 1_999), {
    ok: false,
    reason: 'replay-detected',
  });
  assert.deepEqual(await port.reserve(baseKeys, 1, 2_000), { ok: true });
});

test('openclaw replay: cien reservas concurrentes conceden exactamente una', async () => {
  const port = createMemoryOpenClawReplayPort();
  const results = await Promise.all(
    Array.from({ length: 100 }, () => port.reserve(baseKeys, 900, 1_000)),
  );

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => !result.ok && result.reason === 'replay-detected').length,
    99,
  );
});

test('openclaw replay: store no disponible falla cerrado', async () => {
  const unavailable = createUnavailableOpenClawReplayPort();
  assert.deepEqual(await unavailable.reserve(baseKeys, 900), {
    ok: false,
    reason: 'security-control-unavailable',
  });
});

test('openclaw replay: memoria solo se habilita en test o local explÃ­cito', () => {
  const production = resolveOpenClawReplayPort({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    OPENCLAW_REPLAY_MODE: 'memory',
  });
  const local = resolveOpenClawReplayPort({
    NODE_ENV: 'development',
    OPENCLAW_REPLAY_MODE: 'memory',
  });

  assert.notEqual(production, local);
});

test('openclaw replay: HTTP aplica rate, replay y despuÃ©s parsea JSON', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/openclaw/http.ts'), 'utf8');
  const rateIndex = source.indexOf('const rate = await resolveOpenClawRateLimitPort');
  const replayIndex = source.indexOf('const replay = await resolveOpenClawReplayPort().reserve');
  const jsonIndex = source.indexOf('const strictJson = parseOpenClawJsonStrict');

  assert.ok(rateIndex >= 0);
  assert.ok(replayIndex > rateIndex);
  assert.ok(jsonIndex > replayIndex);
  assert.match(source, /409[\s\S]*replay-detected/);
  assert.match(source, /503[\s\S]*security-control-unavailable/);
});
