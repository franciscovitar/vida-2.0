import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeGymSheetValues, isGymSpreadsheetConfigured } from '@/lib/gym/sheets-read';
import { computeGymV2Analytics } from '@/lib/gym/v2-analytics';
import type { GymSession, GymSessionSummary } from '@/types/gym';

function session(input: {
  key: string;
  date: string;
  day?: string;
  exercises: Array<{
    name: string;
    sets: Array<{ load: number | null; reps: number | null }>;
  }>;
}): GymSession {
  return {
    key: input.key,
    date: input.date,
    routineName: 'Rutina',
    dayLabel: input.day ?? 'Torso',
    startedAt: null,
    endedAt: null,
    durationMinutes: null,
    note: null,
    exercises: input.exercises.map((exercise, exerciseIndex) => ({
      key: `${input.key}-exercise-${exerciseIndex}`,
      exerciseName: exercise.name,
      order: exerciseIndex + 1,
      note: null,
      sets: exercise.sets.map((set, setIndex) => ({
        key: `${input.key}-set-${exerciseIndex}-${setIndex}`,
        setNumber: setIndex + 1,
        load: set.load === null ? null : String(set.load),
        reps: set.reps,
        rir: null,
        rpe: null,
        note: null,
      })),
    })),
  };
}

function summaries(sessions: readonly GymSession[]): GymSessionSummary[] {
  return sessions.map((item) => ({
    key: item.key,
    date: item.date,
    label: item.dayLabel,
    durationMinutes: item.durationMinutes,
    completed: true,
  }));
}

test('Gym V2 compara la semana actual contra el mismo punto de la semana anterior', () => {
  const sessions = [
    session({
      key: 'prev-1',
      date: '2026-08-25',
      exercises: [{ name: 'Remo en máquina', sets: [{ load: 50, reps: 8 }] }],
    }),
    session({
      key: 'prev-late',
      date: '2026-08-28',
      exercises: [{ name: 'Remo en máquina', sets: [{ load: 50, reps: 9 }] }],
    }),
    session({
      key: 'current-1',
      date: '2026-09-01',
      exercises: [{ name: 'Remo en máquina', sets: [{ load: 55, reps: 8 }] }],
    }),
    session({
      key: 'current-2',
      date: '2026-09-02',
      exercises: [{ name: 'Jalón al pecho en polea', sets: [{ load: 60, reps: 8 }] }],
    }),
  ];

  const result = computeGymV2Analytics({
    sessions,
    summaries: summaries(sessions),
    weeklyTarget: 3,
    today: '2026-09-02',
  });

  assert.equal(result.currentWeekSessions, 2);
  assert.equal(result.previousWeekSessions, 1);
  assert.equal(result.weeklyDelta, 1);
  assert.equal(result.adherencePercent, 67);
});

test('Gym V2 compara fuerza estimada del mejor set del mismo ejercicio', () => {
  const sessions = [
    session({
      key: 'a',
      date: '2026-08-24',
      exercises: [
        {
          name: 'Jalón al pecho en polea',
          sets: [
            { load: 60, reps: 6 },
            { load: 65, reps: 6 },
          ],
        },
      ],
    }),
    session({
      key: 'b',
      date: '2026-09-01',
      exercises: [
        {
          name: 'Jalón al pecho en polea',
          sets: [
            { load: 65, reps: 8 },
            { load: 65, reps: 5 },
          ],
        },
      ],
    }),
  ];

  const result = computeGymV2Analytics({
    sessions,
    summaries: summaries(sessions),
    weeklyTarget: 3,
    today: '2026-09-02',
  });
  const trend = result.exerciseTrends.find(
    (item) => item.exerciseName === 'Jalón al pecho en polea',
  );

  assert.ok(trend);
  assert.equal(trend.latestLoad, 65);
  assert.equal(trend.latestReps, 8);
  assert.equal(trend.latestPerformance, 82.33);
  assert.equal(trend.previousPerformance, 78);
  assert.equal(trend.deltaPercent, 5.6);
  assert.equal(trend.trend, 'up');
});

test('Gym V2 trata cambios pequeños de fuerza estimada como estables', () => {
  const sessions = [
    session({
      key: 'a',
      date: '2026-08-28',
      exercises: [{ name: 'Remo en máquina', sets: [{ load: 50, reps: 10 }] }],
    }),
    session({
      key: 'b',
      date: '2026-09-01',
      exercises: [{ name: 'Remo en máquina', sets: [{ load: 51, reps: 10 }] }],
    }),
  ];

  const result = computeGymV2Analytics({
    sessions,
    summaries: summaries(sessions),
    weeklyTarget: 3,
    today: '2026-09-02',
  });
  const trend = result.exerciseTrends[0];

  assert.ok(trend);
  assert.equal(trend.trend, 'steady');
  assert.ok(Math.abs(trend.deltaPercent ?? 99) <= 2);
});

test('Gym V2 construye una base personal solo con observaciones previas disponibles', () => {
  const sessions = [
    session({
      key: 'a',
      date: '2026-08-10',
      exercises: [{ name: 'Press militar en máquina', sets: [{ load: 40, reps: 6 }] }],
    }),
    session({
      key: 'b',
      date: '2026-08-20',
      exercises: [{ name: 'Press militar en máquina', sets: [{ load: 45, reps: 6 }] }],
    }),
    session({
      key: 'c',
      date: '2026-09-01',
      exercises: [{ name: 'Press militar en máquina', sets: [{ load: 50, reps: 6 }] }],
    }),
  ];

  const result = computeGymV2Analytics({
    sessions,
    summaries: summaries(sessions),
    weeklyTarget: 3,
    today: '2026-09-02',
  });
  const trend = result.exerciseTrends[0];

  assert.ok(trend?.baselineDeltaPercent !== null);
  assert.equal(result.baselineComparableExercises, 1);
  assert.equal(result.aboveBaselineExercises, 1);
});

test('Gym V2 agrupa series recientes por zona sin llamarlas volumen ideal', () => {
  const sessions = [
    session({
      key: 'a',
      date: '2026-09-01',
      exercises: [
        {
          name: 'Remo en máquina',
          sets: [
            { load: 50, reps: 8 },
            { load: 50, reps: 7 },
            { load: 50, reps: 6 },
          ],
        },
        {
          name: 'Elevaciones laterales con mancuernas',
          sets: [
            { load: 10, reps: 10 },
            { load: 10, reps: 8 },
          ],
        },
        {
          name: 'Dead bug',
          sets: [
            { load: null, reps: 10 },
            { load: null, reps: 8 },
          ],
        },
      ],
    }),
  ];

  const result = computeGymV2Analytics({
    sessions,
    summaries: summaries(sessions),
    weeklyTarget: null,
    today: '2026-09-02',
  });

  assert.equal(result.muscleGroups.find((item) => item.id === 'back')?.completedSets, 3);
  assert.equal(result.muscleGroups.find((item) => item.id === 'shoulders')?.completedSets, 2);
  assert.equal(result.muscleGroups.find((item) => item.id === 'core')?.completedSets, 2);
  assert.equal(result.muscleCoveragePercent, 100);
});

test('Gym V2 no inventa nivel externo para cargas sin benchmark compatible', () => {
  const sessions = [
    session({
      key: 'a',
      date: '2026-09-01',
      exercises: [{ name: 'Prensa horizontal en máquina', sets: [{ load: 100, reps: 10 }] }],
    }),
  ];

  const result = computeGymV2Analytics({
    sessions,
    summaries: summaries(sessions),
    weeklyTarget: 3,
    today: '2026-09-02',
  });

  assert.equal(result.benchmark.status, 'not-ready');
  assert.match(result.benchmark.label, /pendiente/i);
  assert.match(result.benchmark.detail, /máquinas|poleas/i);
});

test('Gym V2 queda en Construyendo base cuando no hay sesiones comparables', () => {
  const sessions = [
    session({
      key: 'a',
      date: '2026-09-01',
      exercises: [{ name: 'Remo en máquina', sets: [{ load: 50, reps: 8 }] }],
    }),
  ];

  const result = computeGymV2Analytics({
    sessions,
    summaries: summaries(sessions),
    weeklyTarget: 3,
    today: '2026-09-02',
  });

  assert.equal(result.statusLabel, 'Construyendo base');
  assert.equal(result.comparableExercises, 0);
  assert.equal(result.improvingExercises, 0);
});

test('Gym V2 normaliza fechas seriales del registro real sin alterar otras celdas', () => {
  const values = [
    ['sessionId', 'date', 'routineKey'],
    ['gym-a', 46258, 'rutina'],
    ['gym-b', '2026-08-28', 'rutina'],
  ];

  const normalized = normalizeGymSheetValues('Gym Sessions', values);
  assert.equal(normalized[1]?.[1], '2026-08-24');
  assert.equal(normalized[2]?.[1], '2026-08-28');
  assert.equal(normalized[1]?.[0], 'gym-a');
});

test('Gym V2 exige una referencia server-side explícita para su spreadsheet', () => {
  assert.equal(isGymSpreadsheetConfigured({}), false);
  assert.equal(
    isGymSpreadsheetConfigured({ GOOGLE_GYM_SPREADSHEET_ID: 'example_gym_spreadsheet_12345' }),
    true,
  );
});
