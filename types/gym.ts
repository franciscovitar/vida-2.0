/**
 * Contratos planos del módulo Gimnasio (8D.2).
 * Independientes de SDK Notion/Google. Sin IDs internos ni URLs privadas.
 *
 * GymSession / GymSet / GymExerciseResult: preparación tipada para 8E (sin escritura).
 */

import type { ContentPage } from '@/types/content';

export type GymDataSourceKind = 'notion' | 'sheets' | 'calendar' | 'sessions';

export type GymDataSourceState =
  'ready' | 'mock' | 'unavailable' | 'error' | 'not-applicable' | 'empty' | 'disabled';

export interface GymDataSourceStatus {
  kind: GymDataSourceKind;
  state: GymDataSourceState;
  notice: string | null;
}

export type GymParseWarningCode =
  | 'routine-without-days'
  | 'exercise-without-prescription'
  | 'unstructured-block'
  | 'incomplete-data'
  | 'stale-routine'
  | 'ambiguous-gym-entries'
  | 'source-down'
  | 'documentary-fallback';

export interface GymParseWarning {
  code: GymParseWarningCode;
  message: string;
  subject: string | null;
}

export interface GymExercisePrescription {
  /** Clave local opaca. */
  key: string;
  name: string;
  order: number;
  sets: number | null;
  reps: string | null;
  rest: string | null;
  targetRir: string | null;
  targetRpe: string | null;
  notes: string | null;
  /** Texto original cuando la prescripción no se estructuró por completo. */
  rawText: string;
}

export interface GymWorkoutDay {
  key: string;
  label: string;
  order: number;
  notes: readonly string[];
  exercises: readonly GymExercisePrescription[];
}

export type GymRoutineSectionKind = 'mobility' | 'recovery' | 'cardio' | 'planning' | 'notes';

/** Bloques complementarios de la rutina que no son días de pesas. */
export interface GymRoutineSection {
  key: string;
  label: string;
  kind: GymRoutineSectionKind;
  order: number;
  description: string | null;
  items: readonly string[];
}

export interface GymRoutine {
  name: string;
  lastUpdatedAt: string | null;
  sourceLabel: string;
  presentation: 'structured' | 'documentary';
  days: readonly GymWorkoutDay[];
  notes: readonly string[];
  supplementalSections: readonly GymRoutineSection[];
}

export interface GymSessionSummary {
  key: string;
  date: string;
  label: string | null;
  durationMinutes: number | null;
  completed: boolean | null;
}

export interface GymExerciseProgress {
  key: string;
  exerciseName: string;
  latestDate: string;
  latestLoad: string | null;
  bestLoad: string | null;
  latestReps: number | null;
  completedSets: number;
}

export interface GymProgressMetric {
  key: string;
  label: string;
  value: string | null;
  unit: string | null;
  context: string | null;
  kind: 'confirmed' | 'trend' | 'coverage' | 'absent';
}

export interface GymReadinessContext {
  energy: string | null;
  sleep: string | null;
  recentExercise: string | null;
  commitments: readonly string[];
  coverage: string | null;
  /** Aviso fijo: no decide si entrenar. */
  disclaimer: string;
}

export type GymModuleStatus =
  | 'ready'
  | 'flag-disabled'
  | 'not-configured'
  | 'empty'
  | 'ambiguous'
  | 'forbidden'
  | 'partial'
  | 'error';

export interface GymDashboardData {
  moduleStatus: GymModuleStatus;
  moduleNotice: string | null;
  routine: GymRoutine | null;
  /** Página documental sanitizada cuando corresponde fallback (sin IDs de Notion). */
  documentaryPage: ContentPage | null;
  readiness: GymReadinessContext;
  progress: readonly GymProgressMetric[];
  sessionSummaries: readonly GymSessionSummary[];
  exerciseProgress: readonly GymExerciseProgress[];
  sources: readonly GymDataSourceStatus[];
  warnings: readonly GymParseWarning[];
  /** Mensaje discreto de preparación 8E. */
  sessionsPendingNotice: string;
  targetDate: string;
  areaHref: '/areas/salud';
}

/* -------------------------------------------------------------------------- */
/* Preparación 8E — solo tipos (sin repositorios de escritura)                 */
/* -------------------------------------------------------------------------- */

export interface GymSet {
  key: string;
  setNumber: number;
  reps: number | null;
  load: string | null;
  rir: number | null;
  rpe: number | null;
  note: string | null;
}

export interface GymExerciseResult {
  key: string;
  exerciseName: string;
  order: number;
  sets: readonly GymSet[];
  note: string | null;
}

export interface GymSession {
  key: string;
  date: string;
  routineName: string | null;
  dayLabel: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  exercises: readonly GymExerciseResult[];
  note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Modelo interactivo local — no implica escritura                            */
/* -------------------------------------------------------------------------- */

export type GymEnergyLevel = 1 | 2 | 3 | 4 | 5;

export type GymSessionDraftState = 'draft' | 'in-progress' | 'ready';

export interface GymSessionDraftSet {
  /** Clave determinista local; nunca es un ID del proveedor. */
  key: string;
  setNumber: number;
  targetReps: string | null;
  targetRir: string | null;
  targetRpe: string | null;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean;
  note: string | null;
}

export interface GymSessionDraftExercise {
  key: string;
  exerciseKey: string;
  exerciseName: string;
  order: number;
  targetSets: number | null;
  targetReps: string | null;
  targetRir: string | null;
  targetRpe: string | null;
  prescriptionNotes: string | null;
  sets: readonly GymSessionDraftSet[];
  note: string | null;
}

export interface GymSessionDraft {
  key: string;
  state: GymSessionDraftState;
  date: string;
  routineKey: string;
  routineName: string;
  workoutDayKey: string;
  workoutDayLabel: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMinutes: number | null;
  energyBefore: GymEnergyLevel | null;
  note: string | null;
  exercises: readonly GymSessionDraftExercise[];
}

export interface GymSessionMetrics {
  totalExercises: number;
  plannedSets: number;
  completedSets: number;
  completionRate: number | null;
  totalReps: number;
  volumeLoad: number;
  averageRir: number | null;
  averageRpe: number | null;
  durationMinutes: number | null;
}

export type GymSessionIssueSeverity = 'error' | 'warning';

export type GymSessionIssueCode =
  | 'invalid-date'
  | 'routine-required'
  | 'workout-day-required'
  | 'no-exercises'
  | 'no-sets'
  | 'no-completed-sets'
  | 'invalid-time-pair'
  | 'invalid-time-order'
  | 'invalid-duration'
  | 'invalid-energy'
  | 'duplicate-set-number'
  | 'invalid-weight'
  | 'invalid-reps'
  | 'invalid-rir'
  | 'invalid-rpe'
  | 'empty-completed-set';

export interface GymSessionIssue {
  code: GymSessionIssueCode;
  severity: GymSessionIssueSeverity;
  message: string;
  exerciseKey: string | null;
  setKey: string | null;
}

export interface GymSessionValidation {
  ready: boolean;
  issues: readonly GymSessionIssue[];
  metrics: GymSessionMetrics;
}
