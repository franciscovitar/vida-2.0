import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeGymSessionAnalytics } from '@/lib/gym/session-analytics';
import type { GymSession, GymSessionSummary } from '@/types/gym';

function session(input: {
  key: string;
  date: string;
  duration?: number | null;
  exercise?: string;
  sets?: Array<{ load: string | null; reps: number | null }>;
}): GymSession {
  const sets = input.sets ?? [];
  return {
    key: input.key,
    date: input.date,
    routineName: 'Rutina A/B',
    dayLabel: 'Día A',
    startedAt: null,
    endedAt: null,
    durationMinutes: input.duration ?? null,
    note: null,
    exercises: [
      {
        key: `${input.key}:exercise`,
        exerciseName: input.exercise ?? 'Press banca',
        order: 1,
        note: null,
        sets: sets.map((set, index) => ({
          key: `${input.key}:set:${index + 1}`,
          setNumber: index + 1,
          load: set.load,
          reps: set.reps,
          rir: null,
          rpe: null,
          note: null,
        })),
      },
    ],
  };
}

function summary(key: string, date: string, completed: boolean | null): GymSessionSummary {
  return {
    key,
    date,
    label: 'Día A',
    durationMinutes: null,
    completed,
  };
}

test('B1-GYM-A1. historial vacío no inventa métricas ni récords', () => {
  const result = computeGymSessionAnalytics({
    sessions: [],
    summaries: [],
    today: '2026-07-24',
    weeklyTarget: 3,
  });

  assert.equal(result.completedSessions, 0);
  assert.equal(result.totalVolumeLoad, 0);
  assert.equal(result.averageDurationMinutes, null);
  assert.equal(result.exerciseRecords.length, 0);
  assert.equal(result.weekly.length, 8);
});

test('B1-GYM-A2. excluye sesiones incompletas y sin estado', () => {
  const sessions = [
    session({ key: 'complete', date: '2026-07-21', sets: [{ load: '80', reps: 8 }] }),
    session({ key: 'partial', date: '2026-07-22', sets: [{ load: '100', reps: 10 }] }),
    session({ key: 'unknown', date: '2026-07-23', sets: [{ load: '120', reps: 5 }] }),
  ];

  const result = computeGymSessionAnalytics({
    sessions,
    summaries: [
      summary('complete', '2026-07-21', true),
      summary('partial', '2026-07-22', false),
      summary('unknown', '2026-07-23', null),
    ],
    today: '2026-07-24',
    weeklyTarget: 3,
  });

  assert.equal(result.completedSessions, 1);
  assert.equal(result.totalVolumeLoad, 640);
  assert.equal(result.trackedSessions, 2);
  assert.equal(result.completionRate, 50);
});

test('B1-GYM-A3. calcula volumen solo con carga y reps confirmadas', () => {
  const complete = session({
    key: 'volume',
    date: '2026-07-21',
    sets: [
      { load: '80 kg', reps: 8 },
      { load: '82,5', reps: 6 },
      { load: null, reps: 10 },
      { load: '50', reps: null },
    ],
  });

  const result = computeGymSessionAnalytics({
    sessions: [complete],
    summaries: [summary('volume', '2026-07-21', true)],
    today: '2026-07-24',
    weeklyTarget: 3,
  });

  assert.equal(result.totalCompletedSets, 4);
  assert.equal(result.totalVolumeLoad, 1135);
  assert.equal(result.volumeCoveragePercent, 50);
});

test('B1-GYM-A4. calcula duración media, máxima y volumen por sesión', () => {
  const first = session({
    key: 'a',
    date: '2026-07-20',
    duration: 40,
    sets: [{ load: '50', reps: 10 }],
  });
  const second = session({
    key: 'b',
    date: '2026-07-22',
    duration: 60,
    sets: [{ load: '80', reps: 10 }],
  });

  const result = computeGymSessionAnalytics({
    sessions: [first, second],
    summaries: [summary('a', '2026-07-20', true), summary('b', '2026-07-22', true)],
    today: '2026-07-24',
    weeklyTarget: 3,
  });

  assert.equal(result.averageDurationMinutes, 50);
  assert.equal(result.longestSessionMinutes, 60);
  assert.equal(result.bestSessionVolume, 800);
  assert.equal(result.averageSessionVolume, 650);
});

test('B1-GYM-A5. calcula adherencia semanal sin limitar valores sobre 100%', () => {
  const sessions = ['a', 'b', 'c', 'd'].map((key, index) =>
    session({
      key,
      date: `2026-07-${20 + index}`,
      sets: [{ load: '10', reps: 10 }],
    }),
  );

  const result = computeGymSessionAnalytics({
    sessions,
    summaries: sessions.map((item) => summary(item.key, item.date, true)),
    today: '2026-07-24',
    weeklyTarget: 3,
  });

  const current = result.weekly.at(-1);
  assert.equal(current?.sessions, 4);
  assert.equal(current?.adherencePercent, 133);
});

test('B1-GYM-A6. conserva semanas sin sesiones como período real de valor cero', () => {
  const complete = session({
    key: 'old',
    date: '2026-06-10',
    sets: [{ load: '50', reps: 5 }],
  });

  const result = computeGymSessionAnalytics({
    sessions: [complete],
    summaries: [summary('old', '2026-06-10', true)],
    today: '2026-07-24',
    weeklyTarget: 3,
  });

  assert.ok(result.weekly.some((week) => week.sessions === 0));
  assert.equal(result.weekly.at(-1)?.volumeLoad, 0);
});

test('B1-GYM-A7. calcula récord y variación por ejercicio', () => {
  const first = session({
    key: 'first',
    date: '2026-07-10',
    exercise: 'Press banca',
    sets: [{ load: '70', reps: 8 }],
  });
  const second = session({
    key: 'second',
    date: '2026-07-20',
    exercise: 'Press banca',
    sets: [
      { load: '75', reps: 8 },
      { load: '80', reps: 5 },
    ],
  });

  const result = computeGymSessionAnalytics({
    sessions: [first, second],
    summaries: [summary('first', '2026-07-10', true), summary('second', '2026-07-20', true)],
    today: '2026-07-24',
    weeklyTarget: null,
  });

  const record = result.exerciseRecords[0];
  assert.equal(record?.latestLoad, 80);
  assert.equal(record?.previousLoad, 70);
  assert.equal(record?.loadDelta, 10);
  assert.equal(record?.bestLoad, 80);
  assert.equal(record?.bestSetVolume, 600);
});

test('B1-GYM-A8. excluye sesiones futuras de toda la analítica', () => {
  const future = session({
    key: 'future',
    date: '2026-07-30',
    sets: [{ load: '100', reps: 10 }],
  });

  const result = computeGymSessionAnalytics({
    sessions: [future],
    summaries: [summary('future', '2026-07-30', true)],
    today: '2026-07-24',
    weeklyTarget: 3,
  });

  assert.equal(result.completedSessions, 0);
  assert.equal(result.totalVolumeLoad, 0);
});

test('B1-GYM-A9. el componente de gráficos permanece solo lectura', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile('components/gym/GymProgressInsights.tsx', 'utf8'),
  );

  assert.equal(source.includes('runWriteAction'), false);
  assert.equal(source.includes('fetch('), false);
  assert.ok(source.includes('No se inventan volumen, récords ni tendencias'));
});

test('B1-GYM-A10. los gráficos declaran etiquetas accesibles', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile('components/gym/GymProgressInsights.tsx', 'utf8'),
  );

  assert.ok(source.includes('aria-labelledby="gym-frequency-chart"'));
  assert.ok(source.includes('aria-labelledby="gym-volume-chart"'));
  assert.ok(source.includes('aria-label='));
});
