import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMaleStrengthLevelBenchmark } from '@/lib/gym/external-strength-benchmark';

test('Gym benchmark clasifica curl y elevaciones laterales masculinas con referencia compatible', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Curl de bíceps con mancuernas',
      latestDate: '2026-09-01',
      latestLoad: 15,
      latestReps: 9,
      latestPerformance: 19.5,
    },
    {
      exerciseName: 'Elevaciones laterales con mancuernas',
      latestDate: '2026-09-01',
      latestLoad: 10,
      latestReps: 9,
      latestPerformance: 13,
    },
  ]);

  assert.equal(result.status, 'ready');
  assert.equal(result.label, 'Novato');
  assert.equal(result.confidence, 'medium');
  assert.equal(result.exercises.length, 2);
  assert.equal(result.exercises.find((item) => item.id === 'dumbbell-curl')?.level, 'novice');
  assert.equal(
    result.exercises.find((item) => item.id === 'dumbbell-lateral-raise')?.level,
    'novice',
  );
  assert.equal(
    result.exercises.find((item) => item.id === 'dumbbell-curl')?.nextThresholdKg,
    21,
  );
  assert.equal(
    result.exercises.find((item) => item.id === 'dumbbell-lateral-raise')?.nextThresholdKg,
    16,
  );
});

test('Gym benchmark toma la variante comparable más reciente del mismo ejercicio', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Curl de bíceps con mancuernas de pie',
      latestDate: '2026-08-24',
      latestLoad: 12.5,
      latestReps: 10,
      latestPerformance: 16.67,
    },
    {
      exerciseName: 'Curl de bíceps con mancuernas',
      latestDate: '2026-09-01',
      latestLoad: 15,
      latestReps: 9,
      latestPerformance: 19.5,
    },
  ]);

  assert.equal(result.status, 'ready');
  assert.equal(result.exercises[0]?.latestDate, '2026-09-01');
  assert.equal(result.exercises[0]?.estimatedOneRepMaxKg, 19.5);
  assert.equal(result.confidence, 'low');
});

test('Gym benchmark excluye máquinas y poleas sin forzar una categoría externa', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Press militar en máquina',
      latestDate: '2026-09-01',
      latestLoad: 50,
      latestReps: 7,
      latestPerformance: 61.67,
    },
    {
      exerciseName: 'Jalón al pecho en polea',
      latestDate: '2026-09-01',
      latestLoad: 65,
      latestReps: 8,
      latestPerformance: 82.33,
    },
  ]);

  assert.equal(result.status, 'not-ready');
  assert.equal(result.exercises.length, 0);
  assert.match(result.detail, /máquinas|poleas/i);
});
