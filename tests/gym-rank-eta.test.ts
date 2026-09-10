import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMaleStrengthLevelBenchmark } from '@/lib/gym/external-strength-benchmark';

test('ETA de rango usa varias exposiciones y no cambia los umbrales fijos', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Remo en máquina',
      latestDate: '2026-09-10',
      latestLoad: 70,
      latestReps: 6,
      observations: [
        { date: '2026-08-20', performance: 72 },
        { date: '2026-08-28', performance: 75 },
        { date: '2026-09-03', performance: 80 },
        { date: '2026-09-10', performance: 84 },
      ],
    },
  ]);

  const row = result.exercises[0];
  assert.ok(row);
  assert.equal(row.estimatedOneRepMaxKg, 84);
  assert.equal(row.level, 'novice');
  assert.equal(row.nextLevel, 'intermediate');
  assert.equal(row.nextThresholdKg, 100);
  assert.match(row.nextLevelEtaLabel ?? '', /^≈ /);
  assert.match(row.nextLevelEtaDetail ?? '', /4 exposiciones/);
});

test('ETA de rango no inventa fecha cuando la tendencia no es positiva', () => {
  const result = buildMaleStrengthLevelBenchmark([
    {
      exerciseName: 'Remo en máquina',
      latestDate: '2026-09-10',
      latestLoad: 70,
      latestReps: 6,
      observations: [
        { date: '2026-08-20', performance: 84 },
        { date: '2026-08-28', performance: 84 },
        { date: '2026-09-03', performance: 83 },
        { date: '2026-09-10', performance: 84 },
      ],
    },
  ]);

  const row = result.exercises[0];
  assert.ok(row);
  assert.equal(row.nextLevelEtaLabel, 'Sin ETA confiable');
});
