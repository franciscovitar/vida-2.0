import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMaleStrengthLevelBenchmark,
  isExternalStrengthBenchmarkSupported,
} from '@/lib/gym/external-strength-benchmark';
import {
  GYM_MALE_ABSOLUTE_1RM_BASELINE,
  GYM_MALE_ABSOLUTE_1RM_BASELINE_VERSION,
} from '@/lib/gym/strength-benchmark-baseline';
import { estimateEpleyOneRepMax } from '@/lib/gym/strength-estimation';

test('Gym benchmark conserva la tabla fija masculina completa y versionada', () => {
  assert.equal(GYM_MALE_ABSOLUTE_1RM_BASELINE_VERSION, '2026-09-02-v1');
  assert.equal(GYM_MALE_ABSOLUTE_1RM_BASELINE.length, 16);

  const byId = new Map(GYM_MALE_ABSOLUTE_1RM_BASELINE.map((entry) => [entry.id, entry]));
  assert.deepEqual(byId.get('lat-pulldown')?.thresholds, {
    beginner: 42,
    novice: 60,
    intermediate: 82,
    advanced: 107,
    elite: 134,
  });
  assert.deepEqual(byId.get('machine-row')?.thresholds, {
    beginner: 41,
    novice: 67,
    intermediate: 100,
    advanced: 141,
    elite: 186,
  });
  assert.deepEqual(byId.get('machine-bench-press')?.thresholds, {
    beginner: 34,
    novice: 56,
    intermediate: 86,
    advanced: 121,
    elite: 161,
  });
  assert.deepEqual(byId.get('machine-shoulder-press')?.thresholds, {
    beginner: 25,
    novice: 45,
    intermediate: 73,
    advanced: 108,
    elite: 148,
  });
  assert.deepEqual(byId.get('dumbbell-curl')?.thresholds, {
    beginner: 7,
    novice: 13,
    intermediate: 21,
    advanced: 31,
    elite: 42,
  });
  assert.deepEqual(byId.get('dumbbell-lateral-raise')?.thresholds, {
    beginner: 4,
    novice: 9,
    intermediate: 16,
    advanced: 24,
    elite: 34,
  });
  assert.deepEqual(byId.get('cable-french-press')?.thresholds, {
    beginner: 12,
    novice: 24,
    intermediate: 41,
    advanced: 62,
    elite: 86,
  });
  assert.deepEqual(byId.get('triceps-pushdown')?.thresholds, {
    beginner: 19,
    novice: 34,
    intermediate: 54,
    advanced: 79,
    elite: 107,
  });
  assert.deepEqual(byId.get('face-pull')?.thresholds, {
    beginner: 14,
    novice: 27,
    intermediate: 45,
    advanced: 68,
    elite: 95,
  });
  assert.deepEqual(byId.get('horizontal-leg-press')?.thresholds, {
    beginner: 66,
    novice: 110,
    intermediate: 168,
    advanced: 238,
    elite: 316,
  });
  assert.deepEqual(byId.get('hip-thrust')?.thresholds, {
    beginner: 45,
    novice: 85,
    intermediate: 140,
    advanced: 208,
    elite: 286,
  });
  assert.deepEqual(byId.get('lying-leg-curl')?.thresholds, {
    beginner: 26,
    novice: 43,
    intermediate: 63,
    advanced: 89,
    elite: 116,
  });
  assert.deepEqual(byId.get('machine-abductor')?.thresholds, {
    beginner: 34,
    novice: 59,
    intermediate: 92,
    advanced: 132,
    elite: 178,
  });
  assert.deepEqual(byId.get('machine-adductor')?.thresholds, {
    beginner: 38,
    novice: 64,
    intermediate: 99,
    advanced: 142,
    elite: 190,
  });
  assert.deepEqual(byId.get('standing-calf-machine')?.thresholds, {
    beginner: 43,
    novice: 82,
    intermediate: 137,
    advanced: 205,
    elite: 284,
  });
  assert.deepEqual(byId.get('seated-calf-raise')?.thresholds, {
    beginner: 28,
    novice: 54,
    intermediate: 91,
    advanced: 137,
    elite: 190,
  });
});

test('Epley calcula el 1RM estimado desde peso y repeticiones y corta en 15 reps', () => {
  assert.equal(estimateEpleyOneRepMax(50, 7), 61.67);
  assert.equal(estimateEpleyOneRepMax(15, 9), 19.5);
  assert.equal(estimateEpleyOneRepMax(80, 18), null);
});

test('Gym benchmark clasifica mancuernas con e1RM calculado desde el set registrado', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Curl de bíceps con mancuernas',
      latestDate: '2026-09-01',
      latestLoad: 15,
      latestReps: 9,
    },
    {
      exerciseName: 'Elevaciones laterales con mancuernas',
      latestDate: '2026-09-01',
      latestLoad: 10,
      latestReps: 9,
    },
  ]);

  assert.equal(result.status, 'ready');
  assert.equal(result.label, 'Novato');
  assert.equal(result.confidence, 'low');
  assert.equal(result.exercises.length, 2);

  const curl = result.exercises.find((item) => item.id === 'dumbbell-curl');
  const lateral = result.exercises.find((item) => item.id === 'dumbbell-lateral-raise');
  assert.equal(curl?.estimatedOneRepMaxKg, 19.5);
  assert.equal(curl?.level, 'novice');
  assert.equal(curl?.nextThresholdKg, 21);
  assert.equal(curl?.nextLevelProgressPercent, 81);
  assert.equal(curl?.confidence, 'high');
  assert.equal(lateral?.estimatedOneRepMaxKg, 13);
  assert.equal(lateral?.level, 'novice');
  assert.equal(lateral?.nextThresholdKg, 16);
  assert.equal(lateral?.nextLevelProgressPercent, 57);
  assert.equal(lateral?.confidence, 'high');
});

test('Gym benchmark ahora compara máquinas y poleas con confianza explícitamente menor', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Press militar en máquina',
      latestDate: '2026-09-01',
      latestLoad: 50,
      latestReps: 7,
    },
    {
      exerciseName: 'Jalón al pecho en polea',
      latestDate: '2026-09-01',
      latestLoad: 65,
      latestReps: 8,
    },
    {
      exerciseName: 'Face pull',
      latestDate: '2026-09-01',
      latestLoad: 45,
      latestReps: 10,
    },
  ]);

  assert.equal(result.status, 'ready');
  assert.equal(result.exercises.length, 3);
  assert.equal(result.confidence, 'medium');

  const press = result.exercises.find((item) => item.id === 'machine-shoulder-press');
  const pulldown = result.exercises.find((item) => item.id === 'lat-pulldown');
  const facePull = result.exercises.find((item) => item.id === 'face-pull');
  assert.equal(press?.estimatedOneRepMaxKg, 61.67);
  assert.equal(press?.level, 'novice');
  assert.equal(press?.confidence, 'low');
  assert.equal(pulldown?.estimatedOneRepMaxKg, 82.33);
  assert.equal(pulldown?.level, 'intermediate');
  assert.equal(pulldown?.confidence, 'medium');
  assert.equal(facePull?.estimatedOneRepMaxKg, 60);
  assert.equal(facePull?.level, 'intermediate');
  assert.equal(facePull?.confidence, 'medium');
});

test('Gym benchmark usa una mediana conservadora para el nivel general', () => {
  const result = buildMaleStrengthLevelBenchmark([
    { exerciseName: 'Curl de bíceps con mancuernas', latestDate: '2026-09-01', latestLoad: 15, latestReps: 9 },
    { exerciseName: 'Jalón al pecho en polea', latestDate: '2026-09-01', latestLoad: 65, latestReps: 8 },
    { exerciseName: 'Press militar en máquina', latestDate: '2026-09-01', latestLoad: 50, latestReps: 7 },
    { exerciseName: 'Face pull', latestDate: '2026-09-01', latestLoad: 45, latestReps: 10 },
  ]);

  assert.equal(result.status, 'ready');
  assert.equal(result.label, 'Novato');
  assert.match(result.detail, /mediana conservadora/i);
});

test('Gym benchmark toma la variante comparable más reciente del mismo ejercicio', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Curl de bíceps con mancuernas de pie',
      latestDate: '2026-08-24',
      latestLoad: 12.5,
      latestReps: 10,
    },
    {
      exerciseName: 'Curl de bíceps con mancuernas',
      latestDate: '2026-09-01',
      latestLoad: 15,
      latestReps: 9,
    },
  ]);

  assert.equal(result.status, 'ready');
  assert.equal(result.exercises[0]?.latestDate, '2026-09-01');
  assert.equal(result.exercises[0]?.estimatedOneRepMaxKg, 19.5);
});

test('Gym benchmark no inventa e1RM para sets de más de 15 repeticiones', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Aductores máquina',
      latestDate: '2026-09-01',
      latestLoad: 80,
      latestReps: 18,
    },
  ]);

  assert.equal(result.status, 'not-ready');
  assert.equal(result.exercises.length, 0);
  assert.match(result.detail, /1–15/);
});

test('Gym benchmark reconoce todos los patrones principales de la tabla fija', () => {
  const names = [
    'Jalón al pecho en polea',
    'Remo en máquina',
    'Press banca en máquina',
    'Press militar en máquina',
    'Curl de bíceps con mancuernas',
    'Elevaciones laterales con mancuernas',
    'Press francés en polea',
    'Tríceps pushdown',
    'Face pull',
    'Prensa horizontal',
    'Hip thrust',
    'Curl femoral tumbado',
    'Abductores máquina',
    'Aductores máquina',
    'Gemelos máquina de pie',
    'Sóleo sentado',
  ];

  for (const name of names) assert.equal(isExternalStrengthBenchmarkSupported(name), true, name);
  assert.equal(isExternalStrengthBenchmarkSupported('Dead bug'), false);
});
