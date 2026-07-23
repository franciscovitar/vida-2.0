/** Esquema contractual compartido por lectura y escritura de sesiones de gimnasio. */
export const GYM_SESSIONS_HEADERS = [
  'sessionId',
  'date',
  'routineKey',
  'workoutDayKey',
  'startedAt',
  'finishedAt',
  'durationMinutes',
  'energyBefore',
  'notes',
  'status',
  'idempotencyKey',
  'createdAt',
] as const;

export const GYM_SETS_HEADERS = [
  'sessionId',
  'exerciseKey',
  'exerciseName',
  'setIndex',
  'weight',
  'reps',
  'rir',
  'rpe',
  'completed',
  'notes',
] as const;
