import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPersonalStrengthGoals } from '@/lib/gym/personal-strength-goals';
import type { GymV2ExerciseTrend } from '@/lib/gym/v2-analytics';
import type { GymRoutineSection } from '@/types/gym';

function section(items: string[], label = 'Metas personales de fuerza'): GymRoutineSection {
  return { key: 'personal-goals', label, kind: 'notes', order: 1, description: null, items };
}

function trend(exerciseName: string, latestDate: string, latestLoad: number, latestReps: number): GymV2ExerciseTrend {
  return {
    key: exerciseName, exerciseName, latestDate, latestLoad, latestReps,
    latestPerformance: null, previousPerformance: null, bestLoad: latestLoad,
    bestPerformance: null, deltaPercent: null, baselineDeltaPercent: null,
    trend: 'unknown', sessionCount: 1, completedSets: 1, series: [], observations: [],
  };
}

test('personal strength goals are owned by Notion, not by external benchmark thresholds', () => {
  const goals = buildPersonalStrengthGoals(
    [section([
      'Jalón al pecho — 100 kg × 10',
      'Bíceps sentado — 22,5 kg × 8–10 por mancuerna',
      'Prensa horizontal — 140–160 kg × 10 (muy provisional)',
    ])],
    [
      trend('Jalón al pecho en polea', '2026-10-14', 75, 8),
      trend('Curl de bíceps con mancuernas sentado', '2026-10-14', 15, 10),
      trend('Prensa horizontal en máquina', '2026-10-15', 90, 10),
    ],
  );
  assert.equal(goals.length, 3);
  assert.deepEqual(goals.map(({ latestLoad, latestReps }) => [latestLoad, latestReps]), [[75, 8], [15, 10], [90, 10]]);
  assert.equal(goals[1]!.target, '22,5 kg × 8–10 por mancuerna');
  assert.equal(goals[2]!.provisional, true);
});

test('goal matches keep lateral-raise variants separate and prefer the latest comparable exposure', () => {
  const goals = buildPersonalStrengthGoals(
    [section(['Elevaciones laterales — 17,5–20 kg × 10–12 por mancuerna'])],
    [
      trend('Elevaciones laterales con mancuernas de pie', '2026-10-16', 15, 8),
      trend('Elevaciones laterales con mancuernas', '2026-10-14', 12.5, 13),
      trend('Elevaciones laterales con mancuernas', '2026-10-09', 12.5, 10),
    ],
  );
  assert.equal(goals[0]!.latestLoad, 12.5);
  assert.equal(goals[0]!.latestReps, 13);
  assert.equal(goals[0]!.latestDate, '2026-10-14');
});

test('missing Notion goals or unmatched exercise do not invent personal data', () => {
  assert.deepEqual(buildPersonalStrengthGoals([], []), []);
  const goals = buildPersonalStrengthGoals([section(['Press pecho máquina — 110–120 kg × 10'])], []);
  assert.equal(goals[0]!.latestLoad, null);
  assert.equal(goals[0]!.latestReps, null);
});
