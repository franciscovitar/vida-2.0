import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildGymPreviousWeekSnapshot,
  recognizedGymDayLabel,
} from '@/lib/gym/previous-week';
import type { GymExerciseResult, GymSession, GymSessionSummary } from '@/types/gym';

function exercise(key: string, name: string, load = '50', reps = 8): GymExerciseResult {
  return {
    key,
    exerciseName: name,
    order: 1,
    sets: [
      {
        key: `${key}-set`,
        setNumber: 1,
        load,
        reps,
        rir: null,
        rpe: null,
        note: null,
      },
    ],
    note: null,
  };
}

function session(input: {
  key: string;
  date: string;
  dayLabel: string | null;
  exercises: string[];
}): GymSession {
  return {
    key: input.key,
    date: input.date,
    routineName: 'Rutina Gimnasio',
    dayLabel: input.dayLabel,
    startedAt: null,
    endedAt: null,
    durationMinutes: 60,
    exercises: input.exercises.map((name, index) => exercise(`${input.key}-${index}`, name)),
    note: null,
  };
}

function summary(item: GymSession, completed = true): GymSessionSummary {
  return {
    key: item.key,
    date: item.date,
    label: item.dayLabel,
    durationMinutes: item.durationMinutes,
    completed,
  };
}

const torsoAExercises = [
  'Jalón al pecho en polea',
  'Press francés en polea',
  'Face pull',
  'Elevaciones laterales con mancuernas',
  'Press militar en máquina',
  'Remo en máquina',
];

const torsoBExercises = [
  'Jalón al pecho en polea',
  'Remo en máquina',
  'Press de banca en máquina',
  'Press militar en máquina',
  'Face pull',
  'Elevaciones laterales con mancuernas',
  'Extensión de tríceps en polea',
];

test('selecciona solo la semana calendario completa inmediatamente anterior', () => {
  const unlabeled = session({
    key: 'a-old',
    date: '2026-08-24',
    dayLabel: null,
    exercises: torsoAExercises,
  });
  const leg = session({
    key: 'leg',
    date: '2026-08-25',
    dayLabel: 'dia-2-pierna-futbol-postura',
    exercises: ['Prensa horizontal en máquina'],
  });
  const torsoB = session({
    key: 'b',
    date: '2026-08-28',
    dayLabel: 'dia-3-torso-b',
    exercises: torsoBExercises,
  });
  const current = session({
    key: 'a-current',
    date: '2026-09-01',
    dayLabel: 'dia-1-torso-a',
    exercises: torsoAExercises,
  });
  const all = [current, torsoB, leg, unlabeled];

  const result = buildGymPreviousWeekSnapshot({
    sessions: all,
    summaries: all.map((item) => summary(item)),
    today: '2026-09-02',
  });

  assert.equal(result.startDate, '2026-08-24');
  assert.equal(result.endDate, '2026-08-30');
  assert.deepEqual(
    result.sessions.map((entry) => [entry.session.key, entry.displayLabel, entry.labelInferred]),
    [
      ['a-old', 'Torso A', true],
      ['leg', 'Pierna', false],
      ['b', 'Torso B', false],
    ],
  );
});

test('el lunes rota automáticamente a la semana que acaba de terminar', () => {
  const previousMonday = session({
    key: 'week-new',
    date: '2026-09-01',
    dayLabel: 'dia-1-torso-a',
    exercises: torsoAExercises,
  });
  const older = session({
    key: 'week-old',
    date: '2026-08-28',
    dayLabel: 'dia-3-torso-b',
    exercises: torsoBExercises,
  });

  const result = buildGymPreviousWeekSnapshot({
    sessions: [previousMonday, older],
    summaries: [summary(previousMonday), summary(older)],
    today: '2026-09-07',
  });

  assert.equal(result.startDate, '2026-08-31');
  assert.equal(result.endDate, '2026-09-06');
  assert.deepEqual(result.sessions.map((entry) => entry.session.key), ['week-new']);
});

test('solo muestra sesiones confirmadas como completas', () => {
  const complete = session({
    key: 'complete',
    date: '2026-08-25',
    dayLabel: 'dia-2-pierna-futbol-postura',
    exercises: ['Prensa horizontal en máquina'],
  });
  const partial = session({
    key: 'partial',
    date: '2026-08-28',
    dayLabel: 'dia-3-torso-b',
    exercises: torsoBExercises,
  });

  const result = buildGymPreviousWeekSnapshot({
    sessions: [complete, partial],
    summaries: [summary(complete, true), summary(partial, false)],
    today: '2026-09-02',
  });

  assert.deepEqual(result.sessions.map((entry) => entry.session.key), ['complete']);
});

test('una coincidencia débil no inventa un nombre de rutina', () => {
  const unknown = session({
    key: 'unknown',
    date: '2026-08-24',
    dayLabel: null,
    exercises: ['Ejercicio aislado', 'Otro ejercicio'],
  });
  const reference = session({
    key: 'reference',
    date: '2026-09-01',
    dayLabel: 'dia-1-torso-a',
    exercises: torsoAExercises,
  });

  const result = buildGymPreviousWeekSnapshot({
    sessions: [unknown, reference],
    summaries: [summary(unknown), summary(reference)],
    today: '2026-09-02',
  });

  assert.equal(result.sessions[0]?.displayLabel, 'Entreno');
  assert.equal(result.sessions[0]?.labelInferred, false);
});

test('reconoce las tres etiquetas canónicas del split sin exponer las keys técnicas', () => {
  assert.equal(recognizedGymDayLabel('dia-1-torso-a'), 'Torso A');
  assert.equal(recognizedGymDayLabel('dia-2-pierna-futbol-postura'), 'Pierna');
  assert.equal(recognizedGymDayLabel('dia-3-torso-b'), 'Torso B');
  assert.equal(recognizedGymDayLabel(null), null);
});
