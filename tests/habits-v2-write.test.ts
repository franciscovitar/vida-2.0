import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  HABIT_LOG_V2_HEADERS,
  HABIT_REGISTRY_HEADERS,
  parseHabitLogV2Table,
  parseHabitRegistryTable,
} from '@/lib/habits/v2-contract';
import {
  createHabitsV2WriteService,
  type HabitV2ExclusiveWriter,
  type HabitV2SheetPort,
} from '@/lib/habits/v2-write-core';

type Cell = string | number | boolean | null;

function initialRegistry(): Cell[][] {
  return [
    [...HABIT_REGISTRY_HEADERS],
    [
      'journaling',
      'Journaling',
      '📓',
      true,
      'manual',
      'daily',
      1,
      'vez',
      '',
      '',
      '',
      'Journaling',
      'habit-registry-v2',
    ],
    [
      'gym',
      'Gimnasio',
      '🏋️',
      true,
      'derived',
      'weekly',
      3,
      'sesiones',
      '',
      '',
      'gym-session',
      'Gimnasio',
      'habit-registry-v2',
    ],
  ];
}

function fakePort() {
  const registry = initialRegistry();
  const log: Cell[][] = [[...HABIT_LOG_V2_HEADERS]];
  const legacy: Cell[][] = [
    ['Fecha', 'Journaling', 'Gimnasio'],
    ['2026-10-07', false, true],
    ['2026-10-08', false, false],
  ];
  const writes: { range: string; values: readonly (readonly Cell[])[] }[] = [];

  const port: HabitV2SheetPort = {
    async readRegistry() {
      return { ok: true, values: registry.map((row) => [...row]) };
    },
    async readLog() {
      return { ok: true, values: log.map((row) => [...row]) };
    },
    async readLegacy() {
      return { ok: true, values: legacy.map((row) => [...row]) };
    },
    async putValues(range, values) {
      writes.push({ range, values });
      const logMatch = /^Habit Log V2!A(\d+):H\1$/.exec(range);
      if (logMatch) {
        const row = Number(logMatch[1]);
        while (log.length < row) log.push([]);
        log[row - 1] = [...(values[0] ?? [])];
        return { ok: true };
      }

      const registryNew = /^Habit Registry!A(\d+):M\1$/.exec(range);
      if (registryNew) {
        const row = Number(registryNew[1]);
        while (registry.length < row) registry.push([]);
        registry[row - 1] = [...(values[0] ?? [])];
        return { ok: true };
      }

      const registryDeactivate = /^Habit Registry!D(\d+):J\1$/.exec(range);
      if (registryDeactivate) {
        const row = Number(registryDeactivate[1]);
        const current = registry[row - 1];
        if (!current) return { ok: false };
        const patch = values[0] ?? [];
        for (let index = 0; index < 7; index += 1) {
          current[index + 3] = patch[index] ?? '';
        }
        return { ok: true };
      }

      return { ok: false };
    },
  };

  return { port, registry, log, legacy, writes };
}

/**
 * TEST ONLY, single-process queue. Does not certify durable multi-instance
 * exclusion or lease fencing in a live Google Sheets deployment.
 */
function localTestExclusiveWriter(): HabitV2ExclusiveWriter {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(mutation: () => Promise<T>): Promise<T> {
      const result = tail.then(mutation);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

function service(
  fake: ReturnType<typeof fakePort>,
  enabled = true,
  exclusiveWriter: HabitV2ExclusiveWriter | null = localTestExclusiveWriter(),
) {
  return createHabitsV2WriteService({
    port: fake.port,
    today: '2026-10-08',
    writesEnabled: enabled,
    exclusiveWriter: exclusiveWriter ?? undefined,
    now: () => '2026-10-08T12:00:00Z',
  });
}


test('enabled flag ALONE cannot mutate: missing certified exclusive writer fails before sheet reads', async () => {
  const fake = fakePort();
  let reads = 0;
  const original = fake.port.readRegistry.bind(fake.port);
  fake.port.readRegistry = async () => {
    reads++;
    return original();
  };
  const unguarded = service(fake, true, null);
  const result = await unguarded.addManual({
    name: 'Caminar',
    icon: null,
    cadence: 'daily',
    target: 1,
    unit: 'vez',
    operationId: 'no-fence-001',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unavailable');
  assert.equal(reads, 0);
  assert.equal(fake.writes.length, 0);
});

test('live server action does not inject a fake lock or activate a writer', () => {
  const source = readFileSync(join(process.cwd(), 'app', 'actions', 'habits-v2.ts'), 'utf8');
  assert.match(source, /createHabitsV2WriteService/);
  assert.doesNotMatch(source, /exclusiveWriter:/);
});

test('two independent requests sharing a test-only serial executor cannot overwrite one row', async () => {
  const fake = fakePort();
  const shared = localTestExclusiveWriter();
  const first = service(fake, true, shared);
  const second = service(fake, true, shared);
  const candidate = {
    name: 'Caminar',
    icon: null,
    cadence: 'daily' as const,
    target: 1,
    unit: 'vez',
    operationId: 'same-intent-001',
  };
  const results = await Promise.all([first.addManual(candidate), second.addManual(candidate)]);
  assert.equal(results.filter((x) => x.ok && x.code === 'applied').length, 1);
  assert.equal(results.filter((x) => x.ok && x.code === 'idempotent').length, 1);
  assert.equal(fake.writes.length, 1);
  const registry = parseHabitRegistryTable(fake.registry);
  assert.equal(registry.ok, true);
  if (registry.ok) assert.equal(registry.rows.filter((x) => x.name === 'Caminar').length, 1);
});

test('two different intents choosing same habit name remain conflict-free from overwrite', async () => {
  const fake = fakePort();
  const shared = localTestExclusiveWriter();
  const payload = {
    name: 'Leer',
    icon: null,
    cadence: 'daily' as const,
    target: 1,
    unit: 'vez',
  };
  const [a, b] = await Promise.all([
    service(fake, true, shared).addManual({ ...payload, operationId: 'different-intent-a' }),
    service(fake, true, shared).addManual({ ...payload, operationId: 'different-intent-b' }),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.code, 'conflict');
  assert.equal(fake.writes.length, 1);
});

test('lock unavailability/rejection never retries a Google row PUT', async () => {
  const fake = fakePort();
  const rejecting: HabitV2ExclusiveWriter = {
    async run<T>(_mutation: () => Promise<T>): Promise<T> {
      throw new Error('synthetic lock timeout');
    },
  };
  const result = await service(fake, true, rejecting).toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'mutex-failure-001',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unavailable');
  assert.equal(fake.writes.length, 0);
});

test('historical manual correction writes only Habit Log V2 and verifies replay idempotently', async () => {
  const fake = fakePort();
  const runtime = service(fake);

  const first = await runtime.toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'operation-001',
  });
  assert.equal(first.ok, true);
  assert.equal(fake.writes.length, 1);
  assert.match(fake.writes[0]!.range, /^Habit Log V2!/);
  assert.doesNotMatch(fake.writes[0]!.range, /Registro diario/);

  const replay = await runtime.toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'operation-001',
  });
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.code, 'idempotent');
  assert.equal(fake.writes.length, 1);
});

test('second correction replaces the first V2 entry and produces one linear head', async () => {
  const fake = fakePort();
  const runtime = service(fake);

  await runtime.toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'operation-001',
  });
  const second = await runtime.toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: false,
    expectedPreviousValue: true,
    operationId: 'operation-002',
  });
  assert.equal(second.ok, true);

  const parsed = parseHabitLogV2Table(fake.log);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1]?.replacesEntryId, parsed.rows[0]?.entryId);
});

test('stale expected value conflicts without writing', async () => {
  const fake = fakePort();
  fake.legacy[1]![1] = true;
  const result = await service(fake).toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'operation-003',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'conflict');
  assert.equal(fake.writes.length, 0);
});

test('derived Gym habit rejects manual override', async () => {
  const fake = fakePort();
  const result = await service(fake).toggle({
    targetDate: '2026-10-07',
    habitId: 'gym',
    nextValue: false,
    expectedPreviousValue: true,
    operationId: 'operation-004',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'invalid');
  assert.equal(fake.writes.length, 0);
});

test('add manual habit creates normalized registry row and deactivate preserves history', async () => {
  const fake = fakePort();
  const runtime = service(fake);

  const created = await runtime.addManual({
    name: 'Leer 20 minutos',
    icon: '📚',
    cadence: 'daily',
    target: 1,
    unit: 'vez',
    operationId: 'operation-005',
  });
  assert.equal(created.ok, true);

  const parsed = parseHabitRegistryTable(fake.registry);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const added = parsed.rows.find((row) => row.name === 'Leer 20 minutos');
  assert.ok(added);
  assert.equal(added.validFrom, '2026-10-08');

  const deactivated = await runtime.deactivate({
    habitId: added.habitId,
    expectedActive: true,
    operationId: 'operation-006',
  });
  assert.equal(deactivated.ok, true);

  const after = parseHabitRegistryTable(fake.registry);
  assert.equal(after.ok, true);
  if (!after.ok) return;
  const row = after.rows.find((item) => item.habitId === added.habitId);
  assert.equal(row?.active, false);
  assert.equal(row?.validTo, '2026-10-08');
  assert.equal(fake.log.length, 1);
});

test('write gate is independent and fail-closed', async () => {
  const fake = fakePort();
  const result = await service(fake, false).addManual({
    name: 'Nuevo',
    icon: null,
    cadence: 'daily',
    target: 1,
    unit: 'vez',
    operationId: 'operation-007',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'disabled');
  assert.equal(fake.writes.length, 0);
});

test('Google Habits V2 port never authorizes legacy Registro diario writes or append APIs', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'habits', 'v2-google-port.ts'), 'utf8');
  assert.match(source, /HABITS_V2_WRITES_ENABLED|isHabitsV2WritesEnabled/);
  assert.match(source, /method: 'PUT'/);
  assert.match(source, /valueInputOption=RAW/);
  assert.doesNotMatch(source, /valueInputOption=USER_ENTERED/);
  assert.doesNotMatch(source, /values:append|insertDimension|deleteDimension|batchClear/i);
  assert.doesNotMatch(source, /startsWith\([^)]*REGISTRO_DIARIO_TAB/);
});

test('concurrent legacy correction is detected on immediate pre-write reread', async () => {
  const fake = fakePort();
  let legacyReads = 0;
  const original = fake.port.readLegacy.bind(fake.port);
  fake.port.readLegacy = async () => {
    legacyReads += 1;
    if (legacyReads === 2) fake.legacy[1]![1] = true;
    return original();
  };

  const result = await service(fake).toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'operation-race',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'conflict');
  assert.equal(fake.writes.length, 0);
});

test('concurrent Registry row allocation is detected before adding', async () => {
  const fake = fakePort();
  let registryReads = 0;
  const original = fake.port.readRegistry.bind(fake.port);
  fake.port.readRegistry = async () => {
    registryReads += 1;
    if (registryReads === 2) {
      fake.registry.push([
        'newly-inserted',
        'Concurrent',
        '',
        true,
        'manual',
        'daily',
        1,
        'vez',
        '2026-10-08',
        '',
        '',
        '',
        'habit-registry-v2',
      ]);
    }
    return original();
  };
  const result = await service(fake).addManual({
    name: 'Lectura',
    icon: null,
    cadence: 'daily',
    target: 1,
    unit: 'vez',
    operationId: 'operation-race-two',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'conflict');
  assert.equal(fake.writes.length, 0);
});

test('partial Registry row fails closed without attempting habit creation', async () => {
  const fake = fakePort();
  fake.registry.push(['', 'partial data belongs to someone']);
  const result = await service(fake).addManual({
    name: 'Caminar',
    icon: null,
    cadence: 'daily',
    target: 1,
    unit: 'vez',
    operationId: 'operation-partial-registry',
  });
  assert.equal(result.ok, false);
  assert.equal(fake.writes.length, 0);
});

test('partial Log row fails closed without overwriting historical cells', async () => {
  const fake = fakePort();
  fake.log.push(['', '2026-10-07', 'journaling', true]);
  const result = await service(fake).toggle({
    targetDate: '2026-10-07',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'operation-partial-log',
  });
  assert.equal(result.ok, false);
  assert.equal(fake.writes.length, 0);
});

test('future invalid civil date cannot be used for a correction', async () => {
  const fake = fakePort();
  const result = await service(fake).toggle({
    targetDate: '2026-02-30',
    habitId: 'journaling',
    nextValue: true,
    expectedPreviousValue: false,
    operationId: 'operation-impossible-date',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'invalid');
  assert.equal(fake.writes.length, 0);
});
