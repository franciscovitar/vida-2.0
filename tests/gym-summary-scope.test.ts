import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeGymV2Analytics } from '@/lib/gym/v2-analytics';
import type { GymSession, GymSessionSummary } from '@/types/gym';

function gymSession(
  key: string,
  date: string,
  facePullLoad: number,
  legPressLoad: number,
): GymSession {
  return {
    key,
    date,
    routineName: 'Rutina',
    dayLabel: 'Pierna',
    startedAt: null,
    endedAt: null,
    durationMinutes: null,
    note: null,
    exercises: [
      {
        key: `${key}-face-pull`,
        exerciseName: 'Face pull',
        order: 1,
        note: null,
        sets: [
          {
            key: `${key}-face-pull-set`,
            setNumber: 1,
            load: String(facePullLoad),
            reps: 10,
            rir: null,
            rpe: null,
            note: null,
          },
        ],
      },
      {
        key: `${key}-leg-press`,
        exerciseName: 'Prensa horizontal en máquina',
        order: 2,
        note: null,
        sets: [
          {
            key: `${key}-leg-press-set`,
            setNumber: 1,
            load: String(legPressLoad),
            reps: 8,
            rir: null,
            rpe: null,
            note: null,
          },
        ],
      },
    ],
  };
}

test('Resumen limita señales a ejercicios de la rutina actual sin borrar historial', () => {
  const sessions = [
    gymSession('scope-a', '2026-09-29', 40, 80),
    gymSession('scope-b', '2026-10-06', 30, 90),
  ];
  const summaries: GymSessionSummary[] = sessions.map((session) => ({
    key: session.key,
    date: session.date,
    label: session.dayLabel,
    durationMinutes: null,
    completed: true,
  }));

  const scoped = computeGymV2Analytics({
    sessions,
    summaries,
    weeklyTarget: 3,
    today: '2026-10-06',
    exerciseScopeNames: ['Prensa horizontal'],
  });
  const full = computeGymV2Analytics({
    sessions,
    summaries,
    weeklyTarget: 3,
    today: '2026-10-06',
  });

  assert.equal(scoped.comparableExercises, 1);
  assert.equal(scoped.exerciseTrends.length, 1);
  assert.match(scoped.exerciseTrends[0]!.exerciseName, /Prensa horizontal/i);
  assert.equal(scoped.insights.some((insight) => /Face pull/i.test(insight.title)), false);
  assert.equal(full.exerciseTrends.some((trend) => /Face pull/i.test(trend.exerciseName)), true);
});
