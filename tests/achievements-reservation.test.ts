import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACHIEVEMENT_RESERVE_SCRIPT,
  achievementReservationKey,
  createAchievementReservationPort,
  resolveAchievementReservationConfig,
} from '@/lib/achievements/persistent-reservation';

const dataSourceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const eventKey = 'university:synthetic:p2:passed';
const env = {
  ACHIEVEMENTS_V1_WRITE_ENABLED: 'true',
  NOTION_ACHIEVEMENTS_DATA_SOURCE_ID: dataSourceId,
  UPSTASH_REDIS_REST_URL: 'https://synthetic.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-test-token-only',
};
const cfg = resolveAchievementReservationConfig(env);
assert.ok(cfg);

function fakeRedis() {
  const keys = new Map<string, string>();
  const commands: unknown[][] = [];
  const fetchFn = (async (_url: unknown, init: { body?: unknown }) => {
    const parts = JSON.parse(String(init.body)) as unknown[];
    commands.push(parts);
    assert.equal(parts[0], 'EVAL');
    assert.equal(parts[2], 1);
    const key = parts[3] as string;
    const token = parts[4] as string;
    let result = 'BLOCKED';
    if (!keys.has(key)) {
      keys.set(key, token);
      result = 'RESERVED';
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ result }),
    };
  }) as unknown as typeof fetch;
  return { keys, commands, fetchFn };
}

test('write reservation is off by default', () => {
  assert.equal(resolveAchievementReservationConfig({}), null);
  assert.equal(
    resolveAchievementReservationConfig({ ...env, ACHIEVEMENTS_V1_WRITE_ENABLED: 'TRUE' }),
    null,
  );
});

test('invalid or colliding source ID blocks availability', () => {
  assert.equal(
    resolveAchievementReservationConfig({ ...env, NOTION_ACHIEVEMENTS_DATA_SOURCE_ID: 'bad' }),
    null,
  );
  assert.equal(
    resolveAchievementReservationConfig({
      ...env,
      NOTION_TASKS_DATA_SOURCE_ID: dataSourceId.toUpperCase(),
    }),
    null,
  );
});

test('missing Redis credentials block availability', () => {
  assert.equal(resolveAchievementReservationConfig({ ...env, UPSTASH_REDIS_REST_TOKEN: '' }), null);
});

test('canonical event identity hashes private event key and source', () => {
  const key = achievementReservationKey(dataSourceId, eventKey);
  assert.match(key, /:[a-f0-9]{64}$/);
  assert.ok(!key.includes(eventKey));
  assert.notEqual(key, achievementReservationKey(dataSourceId, 'university:synthetic:p3:passed'));
  assert.notEqual(
    key,
    achievementReservationKey('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', eventKey),
  );
});

test('invalid event cannot reach Redis', async () => {
  const backend = fakeRedis();
  const port = createAchievementReservationPort(cfg, backend.fetchFn);
  assert.equal((await port.reserve('invalid')).status, 'unavailable');
  assert.equal(backend.commands.length, 0);
});

test('two concurrent calls can reserve only one event', async () => {
  const backend = fakeRedis();
  const portA = createAchievementReservationPort(cfg, backend.fetchFn);
  const portB = createAchievementReservationPort(cfg, backend.fetchFn);
  const [a, b] = await Promise.all([portA.reserve(eventKey), portB.reserve(eventKey)]);
  assert.deepEqual([a.status, b.status].sort(), ['blocked', 'reserved']);
  assert.equal(backend.keys.size, 1);
  assert.equal(backend.commands.length, 2);
});

test('reservation persists across simulated restart and replay', async () => {
  const backend = fakeRedis();
  assert.equal(
    (await createAchievementReservationPort(cfg, backend.fetchFn).reserve(eventKey)).status,
    'reserved',
  );
  const freshPort = createAchievementReservationPort(cfg, backend.fetchFn);
  assert.equal((await freshPort.reserve(eventKey)).status, 'blocked');
  assert.equal(backend.keys.size, 1);
});

test('different events remain independently reservable', async () => {
  const backend = fakeRedis();
  const port = createAchievementReservationPort(cfg, backend.fetchFn);
  assert.equal((await port.reserve(eventKey)).status, 'reserved');
  assert.equal((await port.reserve('university:synthetic:p3:passed')).status, 'reserved');
  assert.equal(backend.keys.size, 2);
});

test('Redis transport failures do not grant reservation', async () => {
  const unavailable = (async () => {
    throw new Error('simulated unavailable');
  }) as unknown as typeof fetch;
  const outcome = await createAchievementReservationPort(cfg, unavailable).reserve(eventKey);
  assert.equal(outcome.status, 'unavailable');
});

test('unknown Redis response fails closed', async () => {
  const unknown = (async () => ({
    ok: true,
    text: async () => JSON.stringify({ result: 'SOMETHING_ELSE' }),
  })) as unknown as typeof fetch;
  assert.equal(
    (await createAchievementReservationPort(cfg, unknown).reserve(eventKey)).status,
    'unavailable',
  );
});

test('Lua uses permanent NX reservation, not expiring approval lease', () => {
  assert.match(ACHIEVEMENT_RESERVE_SCRIPT, /SET.*'NX'/);
  assert.doesNotMatch(ACHIEVEMENT_RESERVE_SCRIPT, /\bEX\b|\bPX\b|\bEXPIRE\b/i);
});
