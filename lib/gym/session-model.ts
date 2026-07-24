import type { GymSessionCreatePayload } from '@/types/actions';
import type {
  GymEnergyLevel,
  GymRoutine,
  GymSessionDraft,
  GymSessionDraftExercise,
  GymSessionDraftSet,
  GymSessionDraftState,
  GymSessionIssue,
  GymSessionMetrics,
  GymSessionValidation,
} from '@/types/gym';

const MAX_SESSION_MINUTES = 12 * 60;
const MAX_WEIGHT_KG = 1000;
const MAX_REPS = 500;
const MAX_RIR = 10;
const MAX_RPE = 10;

export type CreateGymSessionDraftResult =
  | { ok: true; draft: GymSessionDraft }
  | { ok: false; code: 'workout-day-not-found'; message: string };

export type BuildGymSessionPayloadResult =
  | { ok: true; payload: GymSessionCreatePayload; validation: GymSessionValidation }
  | { ok: false; validation: GymSessionValidation };

function isYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function deterministicDraftKey(routineName: string, workoutDayKey: string, date: string): string {
  return `gym-draft:${date}:${routineName}:${workoutDayKey}`;
}

function draftSetKey(exerciseKey: string, setNumber: number): string {
  return `${exerciseKey}:set:${setNumber}`;
}

function createDraftSets(input: {
  exerciseKey: string;
  count: number | null;
  targetReps: string | null;
  targetRir: string | null;
  targetRpe: string | null;
}): GymSessionDraftSet[] {
  if (input.count === null || input.count < 1) return [];

  return Array.from({ length: input.count }, (_, index) => {
    const setNumber = index + 1;
    return {
      key: draftSetKey(input.exerciseKey, setNumber),
      setNumber,
      targetReps: input.targetReps,
      targetRir: input.targetRir,
      targetRpe: input.targetRpe,
      weight: null,
      reps: null,
      rir: null,
      rpe: null,
      completed: false,
      note: null,
    };
  });
}

export function createGymSessionDraft(input: {
  routine: GymRoutine;
  workoutDayKey: string;
  date: string;
}): CreateGymSessionDraftResult {
  const day = input.routine.days.find((item) => item.key === input.workoutDayKey);
  if (!day) {
    return {
      ok: false,
      code: 'workout-day-not-found',
      message: 'El día elegido no existe en la rutina actual.',
    };
  }

  const exercises: GymSessionDraftExercise[] = day.exercises.map((exercise) => ({
    key: `draft-exercise:${exercise.key}`,
    exerciseKey: exercise.key,
    exerciseName: exercise.name,
    order: exercise.order,
    targetSets: exercise.sets,
    targetReps: exercise.reps,
    targetRir: exercise.targetRir,
    targetRpe: exercise.targetRpe,
    prescriptionNotes: exercise.notes,
    sets: createDraftSets({
      exerciseKey: exercise.key,
      count: exercise.sets,
      targetReps: exercise.reps,
      targetRir: exercise.targetRir,
      targetRpe: exercise.targetRpe,
    }),
    note: null,
  }));

  return {
    ok: true,
    draft: {
      key: deterministicDraftKey(input.routine.name, day.key, input.date),
      state: 'draft',
      date: input.date,
      routineKey: input.routine.name,
      routineName: input.routine.name,
      workoutDayKey: day.key,
      workoutDayLabel: day.label,
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      energyBefore: null,
      note: null,
      exercises,
    },
  };
}

export function calculateGymSessionDurationMinutes(
  startedAt: string | null,
  finishedAt: string | null,
  explicitDurationMinutes: number | null,
): number | null {
  if (
    explicitDurationMinutes !== null &&
    Number.isFinite(explicitDurationMinutes) &&
    explicitDurationMinutes >= 0
  ) {
    return Math.round(explicitDurationMinutes);
  }

  const start = parseTimestamp(startedAt);
  const finish = parseTimestamp(finishedAt);
  if (start === null || finish === null || finish < start) return null;
  return Math.round((finish - start) / 60_000);
}

export function calculateGymSessionMetrics(draft: GymSessionDraft): GymSessionMetrics {
  const sets = draft.exercises.flatMap((exercise) => exercise.sets);
  const completedSets = sets.filter((set) => set.completed);
  const rirValues = completedSets.flatMap((set) => (set.rir === null ? [] : [set.rir]));
  const rpeValues = completedSets.flatMap((set) => (set.rpe === null ? [] : [set.rpe]));

  const totalReps = completedSets.reduce((sum, set) => sum + (set.reps ?? 0), 0);
  const volumeLoad = completedSets.reduce((sum, set) => {
    if (set.weight === null || set.reps === null) return sum;
    return sum + set.weight * set.reps;
  }, 0);

  return {
    totalExercises: draft.exercises.length,
    plannedSets: sets.length,
    completedSets: completedSets.length,
    completionRate:
      sets.length === 0 ? null : Math.round((completedSets.length / sets.length) * 100),
    totalReps,
    volumeLoad: Math.round(volumeLoad * 100) / 100,
    averageRir: average(rirValues),
    averageRpe: average(rpeValues),
    durationMinutes: calculateGymSessionDurationMinutes(
      draft.startedAt,
      draft.finishedAt,
      draft.durationMinutes,
    ),
  };
}

function issue(
  code: GymSessionIssue['code'],
  message: string,
  exerciseKey: string | null = null,
  setKey: string | null = null,
): GymSessionIssue {
  return { code, severity: 'error', message, exerciseKey, setKey };
}

function isValidEnergy(value: GymEnergyLevel | null): boolean {
  return value === null || [1, 2, 3, 4, 5].includes(value);
}

export function deriveGymSessionDraftState(draft: GymSessionDraft): GymSessionDraftState {
  const validation = validateGymSessionDraft(draft);
  if (validation.ready) return 'ready';
  if (draft.startedAt || validation.metrics.completedSets > 0) return 'in-progress';
  return 'draft';
}

export function validateGymSessionDraft(draft: GymSessionDraft): GymSessionValidation {
  const issues: GymSessionIssue[] = [];
  const metrics = calculateGymSessionMetrics(draft);

  if (!isYmd(draft.date)) {
    issues.push(issue('invalid-date', 'La fecha de la sesión no es válida.'));
  }
  if (!draft.routineKey.trim()) {
    issues.push(issue('routine-required', 'La rutina es obligatoria.'));
  }
  if (!draft.workoutDayKey.trim()) {
    issues.push(issue('workout-day-required', 'El día de entrenamiento es obligatorio.'));
  }
  if (draft.exercises.length === 0) {
    issues.push(issue('no-exercises', 'La sesión no contiene ejercicios.'));
  }
  if (metrics.plannedSets === 0) {
    issues.push(issue('no-sets', 'Agregá al menos un set antes de continuar.'));
  }
  if (metrics.completedSets === 0) {
    issues.push(issue('no-completed-sets', 'Marcá al menos un set como completado.'));
  }

  const start = parseTimestamp(draft.startedAt);
  const finish = parseTimestamp(draft.finishedAt);
  const oneTimestampOnly = (draft.startedAt === null) !== (draft.finishedAt === null);

  if (
    oneTimestampOnly ||
    (draft.startedAt !== null && start === null) ||
    (draft.finishedAt !== null && finish === null)
  ) {
    issues.push(issue('invalid-time-pair', 'Completá inicio y finalización con horarios válidos.'));
  } else if (start !== null && finish !== null && finish < start) {
    issues.push(issue('invalid-time-order', 'La finalización no puede ser anterior al inicio.'));
  }

  if (
    draft.durationMinutes !== null &&
    (!Number.isFinite(draft.durationMinutes) ||
      draft.durationMinutes < 0 ||
      draft.durationMinutes > MAX_SESSION_MINUTES)
  ) {
    issues.push(issue('invalid-duration', 'La duración debe estar entre 0 y 720 minutos.'));
  }
  if (!isValidEnergy(draft.energyBefore)) {
    issues.push(issue('invalid-energy', 'La energía previa debe estar entre 1 y 5.'));
  }

  for (const exercise of draft.exercises) {
    const numbers = new Set<number>();

    for (const set of exercise.sets) {
      if (numbers.has(set.setNumber)) {
        issues.push(
          issue(
            'duplicate-set-number',
            `El ejercicio ${exercise.exerciseName} repite el número de set ${set.setNumber}.`,
            exercise.exerciseKey,
            set.key,
          ),
        );
      }
      numbers.add(set.setNumber);

      if (
        set.weight !== null &&
        (!Number.isFinite(set.weight) || set.weight < 0 || set.weight > MAX_WEIGHT_KG)
      ) {
        issues.push(
          issue('invalid-weight', 'El peso del set no es válido.', exercise.exerciseKey, set.key),
        );
      }
      if (
        set.reps !== null &&
        (!Number.isInteger(set.reps) || set.reps < 0 || set.reps > MAX_REPS)
      ) {
        issues.push(
          issue(
            'invalid-reps',
            'Las repeticiones del set no son válidas.',
            exercise.exerciseKey,
            set.key,
          ),
        );
      }
      if (set.rir !== null && (!Number.isFinite(set.rir) || set.rir < 0 || set.rir > MAX_RIR)) {
        issues.push(
          issue('invalid-rir', 'El RIR del set no es válido.', exercise.exerciseKey, set.key),
        );
      }
      if (set.rpe !== null && (!Number.isFinite(set.rpe) || set.rpe < 1 || set.rpe > MAX_RPE)) {
        issues.push(
          issue('invalid-rpe', 'El RPE del set no es válido.', exercise.exerciseKey, set.key),
        );
      }
      if (
        set.completed &&
        set.weight === null &&
        set.reps === null &&
        set.rir === null &&
        set.rpe === null &&
        !set.note?.trim()
      ) {
        issues.push(
          issue(
            'empty-completed-set',
            'Un set completado debe incluir al menos un dato o una nota.',
            exercise.exerciseKey,
            set.key,
          ),
        );
      }
    }
  }

  return {
    ready: issues.every((item) => item.severity !== 'error'),
    issues,
    metrics,
  };
}

export function buildGymSessionCreatePayload(draft: GymSessionDraft): BuildGymSessionPayloadResult {
  const validation = validateGymSessionDraft(draft);
  if (!validation.ready) return { ok: false, validation };

  return {
    ok: true,
    validation,
    payload: {
      date: draft.date,
      routineKey: draft.routineKey,
      workoutDayKey: draft.workoutDayKey,
      startedAt: draft.startedAt,
      finishedAt: draft.finishedAt,
      durationMinutes: validation.metrics.durationMinutes,
      energyBefore: draft.energyBefore,
      notes: draft.note?.trim() || null,
      sets: draft.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => ({
          exerciseKey: exercise.exerciseKey,
          exerciseName: exercise.exerciseName,
          setIndex: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          rpe: set.rpe,
          completed: set.completed,
          notes: set.note?.trim() || null,
        })),
      ),
    },
  };
}
