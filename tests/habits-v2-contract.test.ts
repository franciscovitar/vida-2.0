import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HABIT_LOG_V2_HEADERS,
  HABIT_REGISTRY_HEADERS,
  deriveGymHabitValue,
  parseHabitLogV2Table,
  parseHabitRegistryTable,
  resolveHabitLogHead,
  resolveManualHabitValue,
  weekDatesThrough,
} from '@/lib/habits/v2-contract';

const registryValues = [
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
] as const;

test('Habits V2 registry parses exact manual and derived rows', () => {
  const parsed = parseHabitRegistryTable(registryValues);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]?.habitId, 'journaling');
  assert.equal(parsed.rows[1]?.derivedSource, 'gym-session');
});

test('Habits V2 rejects malformed registry instead of partially trusting it', () => {
  const malformed = registryValues.map((row) => [...row]);
  malformed[2]![10] = '';
  const parsed = parseHabitRegistryTable(malformed);
  assert.equal(parsed.ok, false);
});

test('Habit Log V2 correction chain resolves only one linear head', () => {
  const log = [
    [...HABIT_LOG_V2_HEADERS],
    [
      'entry-1',
      '2026-10-07',
      'journaling',
      false,
      'manual',
      '',
      '2026-10-08T00:00:00Z',
      'habit-log-v2',
    ],
    [
      'entry-2',
      '2026-10-07',
      'journaling',
      true,
      'manual-correction',
      'entry-1',
      '2026-10-08T00:01:00Z',
      'habit-log-v2',
    ],
  ];
  const parsed = parseHabitLogV2Table(log);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const head = resolveHabitLogHead(parsed.rows, 'journaling', '2026-10-07');
  assert.equal(head.ok, true);
  if (head.ok) assert.equal(head.row?.entryId, 'entry-2');
});

test('Habit Log V2 parallel roots fail closed', () => {
  const log = [
    [...HABIT_LOG_V2_HEADERS],
    [
      'entry-1',
      '2026-10-07',
      'journaling',
      false,
      'manual',
      '',
      '2026-10-08T00:00:00Z',
      'habit-log-v2',
    ],
    [
      'entry-2',
      '2026-10-07',
      'journaling',
      true,
      'manual',
      '',
      '2026-10-08T00:01:00Z',
      'habit-log-v2',
    ],
  ];
  const parsed = parseHabitLogV2Table(log);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(resolveHabitLogHead(parsed.rows, 'journaling', '2026-10-07').ok, false);
});

test('manual effective state prefers V2 log over legacy value', () => {
  const registry = parseHabitRegistryTable(registryValues);
  assert.equal(registry.ok, true);
  if (!registry.ok) return;

  const log = parseHabitLogV2Table([
    [...HABIT_LOG_V2_HEADERS],
    [
      'entry-1',
      '2026-10-07',
      'journaling',
      true,
      'manual-correction',
      '',
      '2026-10-08T00:00:00Z',
      'habit-log-v2',
    ],
  ]);
  assert.equal(log.ok, true);
  if (!log.ok) return;

  const value = resolveManualHabitValue({
    habit: registry.rows[0]!,
    date: '2026-10-07',
    today: '2026-10-08',
    logRows: log.rows,
    legacyValues: [
      ['Fecha', 'Journaling'],
      ['2026-10-07', false],
    ],
  });
  assert.equal(value.ok, true);
  assert.equal(value.value, true);
  assert.equal(value.origin, 'log');
});

test('derived Gym state is done only from canonical completed session', () => {
  const done = deriveGymHabitValue(
    {
      state: 'ready',
      summaries: [{ date: '2026-10-07', completed: true }],
    },
    '2026-10-07',
    '2026-10-08',
  );
  assert.deepEqual(done, { state: 'done', value: true, origin: 'gym-session' });

  const absent = deriveGymHabitValue({ state: 'empty', summaries: [] }, '2026-10-07', '2026-10-08');
  assert.deepEqual(absent, { state: 'missed', value: false, origin: 'gym-session' });

  const unavailable = deriveGymHabitValue(
    { state: 'unavailable', summaries: [] },
    '2026-10-07',
    '2026-10-08',
  );
  assert.equal(unavailable.value, null);
  assert.equal(unavailable.state, 'unavailable');
});

test('weekly date window starts Monday and ends on selected date', () => {
  assert.deepEqual(weekDatesThrough('2026-10-08'), [
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
  ]);
});
