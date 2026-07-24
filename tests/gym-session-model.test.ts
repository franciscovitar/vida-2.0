import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildGymSessionCreatePayload,
  calculateGymSessionDurationMinutes,
  calculateGymSessionMetrics,
  createGymSessionDraft,
  deriveGymSessionDraftState,
  validateGymSessionDraft,
} from '@/lib/gym/session-model';
import type { GymRoutine, GymSessionDraft } from '@/types/gym';

const routine: GymRoutine = {
  name: 'Rutina A/B',
  lastUpdatedAt: '2026-07-24T10:00:00.000Z',
  sourceLabel: 'Notion',
  presentation: 'structured',
  notes: [],
  supplementalSections: [],
  days: [
    {
      key: 'day-a',
      label: 'Día A',
      order: 1,
      notes: [],
      exercises: [
        {
          key: 'press-banca',
          name: 'Press banca',
          order: 1,
          sets: 3,
          reps: '8-10',
          rest: '2 min',
          targetRir: '2',
          targetRpe: null,
          notes: 'Técnica controlada',
          rawText: 'Press banca 3x8-10 RIR 2',
        },
        {
          key: 'face-pull',
          name: 'Face pull',
          order: 2,
          sets: null,
          reps: null,
          rest: null,
          targetRir: null,
          targetRpe: null,
          notes: null,
          rawText: 'Face pull suave',
        },
      ],
    },
  ],
};

function baseDraft(): GymSessionDraft {
  const result = createGymSessionDraft({
    routine,
    workoutDayKey: 'day-a',
    date: '2026-07-24',
  });

  if (!result.ok) throw new Error(result.message);
  return result.draft;
}

function withCompletedFirstSet(draft: GymSessionDraft): GymSessionDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise, exerciseIndex) => ({
      ...exercise,
      sets: exercise.sets.map((set, setIndex) =>
        exerciseIndex === 0 && setIndex === 0
          ? {
              ...set,
              weight: 80,
              reps: 8,
              rir: 2,
              rpe: 8,
              completed: true,
              note: 'Sólido',
            }
          : set,
      ),
    })),
  };
}

test('B1-GYM-1. crea sets exactos cuando la prescripción los define', () => {
  const draft = baseDraft();
  assert.equal(draft.exercises[0]?.sets.length, 3);
  assert.equal(draft.exercises[0]?.sets[0]?.targetReps, '8-10');
  assert.equal(draft.exercises[0]?.sets[0]?.targetRir, '2');
});

test('B1-GYM-2. no inventa sets cuando la prescripción no los define', () => {
  const draft = baseDraft();
  assert.equal(draft.exercises[1]?.targetSets, null);
  assert.equal(draft.exercises[1]?.sets.length, 0);
});

test('B1-GYM-3. rechaza un día que no pertenece a la rutina', () => {
  const result = createGymSessionDraft({
    routine,
    workoutDayKey: 'day-x',
    date: '2026-07-24',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'workout-day-not-found');
});

test('B1-GYM-4. deriva duración entre inicio y finalización', () => {
  assert.equal(
    calculateGymSessionDurationMinutes(
      '2026-07-24T10:00:00.000Z',
      '2026-07-24T10:47:00.000Z',
      null,
    ),
    47,
  );
  assert.equal(
    calculateGymSessionDurationMinutes('2026-07-24T10:00:00.000Z', '2026-07-24T10:47:00.000Z', 50),
    50,
  );
});

test('B1-GYM-5. calcula volumen, reps, esfuerzo y adherencia de sets', () => {
  const draft = withCompletedFirstSet(baseDraft());
  const metrics = calculateGymSessionMetrics(draft);
  assert.equal(metrics.plannedSets, 3);
  assert.equal(metrics.completedSets, 1);
  assert.equal(metrics.completionRate, 33);
  assert.equal(metrics.totalReps, 8);
  assert.equal(metrics.volumeLoad, 640);
  assert.equal(metrics.averageRir, 2);
  assert.equal(metrics.averageRpe, 8);
});

test('B1-GYM-6. una sesión sin sets completados todavía no está lista', () => {
  const validation = validateGymSessionDraft(baseDraft());
  assert.equal(validation.ready, false);
  assert.ok(validation.issues.some((item) => item.code === 'no-completed-sets'));
});

test('B1-GYM-7. un set marcado sin ningún dato se rechaza', () => {
  const draft = baseDraft();
  const invalid: GymSessionDraft = {
    ...draft,
    exercises: draft.exercises.map((exercise, exerciseIndex) => ({
      ...exercise,
      sets: exercise.sets.map((set, setIndex) =>
        exerciseIndex === 0 && setIndex === 0 ? { ...set, completed: true } : set,
      ),
    })),
  };
  const validation = validateGymSessionDraft(invalid);
  assert.ok(validation.issues.some((item) => item.code === 'empty-completed-set'));
});

test('B1-GYM-8. detecta una finalización anterior al inicio', () => {
  const draft = withCompletedFirstSet(baseDraft());
  const invalid = {
    ...draft,
    startedAt: '2026-07-24T11:00:00.000Z',
    finishedAt: '2026-07-24T10:00:00.000Z',
  };
  const validation = validateGymSessionDraft(invalid);
  assert.ok(validation.issues.some((item) => item.code === 'invalid-time-order'));
});

test('B1-GYM-9. genera payload plano preservando completado y notas', () => {
  const draft: GymSessionDraft = {
    ...withCompletedFirstSet(baseDraft()),
    startedAt: '2026-07-24T10:00:00.000Z',
    finishedAt: '2026-07-24T10:45:00.000Z',
    energyBefore: 4,
    note: 'Sesión de prueba',
  };
  const result = buildGymSessionCreatePayload(draft);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.payload.durationMinutes, 45);
  assert.equal(result.payload.energyBefore, 4);
  assert.equal(result.payload.notes, 'Sesión de prueba');
  assert.equal(result.payload.sets[0]?.completed, true);
  assert.equal(result.payload.sets[0]?.notes, 'Sólido');
  assert.equal(result.payload.sets[1]?.completed, false);
});

test('B1-GYM-10. deriva estados draft, in-progress y ready sin persistir', () => {
  const draft = baseDraft();
  assert.equal(deriveGymSessionDraftState(draft), 'draft');
  assert.equal(
    deriveGymSessionDraftState({
      ...draft,
      startedAt: '2026-07-24T10:00:00.000Z',
    }),
    'in-progress',
  );
  assert.equal(deriveGymSessionDraftState(withCompletedFirstSet(draft)), 'ready');
});
