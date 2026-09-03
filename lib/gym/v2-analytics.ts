import type { GymSession, GymSessionSummary } from '@/types/gym';

export type GymV2Trend = 'up' | 'down' | 'steady' | 'unknown';
export type GymV2InsightTone = 'positive' | 'watch' | 'neutral';
export type GymV2MuscleGroupId =
  'back' | 'shoulders' | 'chest' | 'biceps' | 'triceps' | 'legs' | 'core' | 'other';

export interface GymV2ExerciseTrend {
  key: string;
  exerciseName: string;
  latestDate: string;
  latestLoad: number | null;
  latestReps: number | null;
  latestPerformance: number | null;
  previousPerformance: number | null;
  bestLoad: number | null;
  bestPerformance: number | null;
  deltaPercent: number | null;
  baselineDeltaPercent: number | null;
  trend: GymV2Trend;
  sessionCount: number;
  completedSets: number;
  series: readonly number[];
}

export interface GymV2MuscleGroupSummary {
  id: GymV2MuscleGroupId;
  label: string;
  completedSets: number;
  sharePercent: number;
}

export interface GymV2Insight {
  id: string;
  title: string;
  detail: string;
  tone: GymV2InsightTone;
}

export interface GymV2Analytics {
  statusLabel: string;
  statusDetail: string;
  currentWeekSessions: number;
  previousWeekSessions: number;
  weeklyDelta: number;
  weeklyTarget: number | null;
  adherencePercent: number | null;
  improvingExercises: number;
  stableExercises: number;
  decliningExercises: number;
  comparableExercises: number;
  aboveBaselineExercises: number;
  baselineComparableExercises: number;
  latestSessionDate: string | null;
  latestSessionLabel: string | null;
  exerciseTrends: readonly GymV2ExerciseTrend[];
  muscleGroups: readonly GymV2MuscleGroupSummary[];
  muscleCoveragePercent: number | null;
  insights: readonly GymV2Insight[];
  benchmark: {
    status: 'not-ready';
    label: string;
    detail: string;
  };
}

interface ExerciseObservation {
  date: string;
  load: number;
  reps: number;
  performance: number;
}

interface ExerciseAccumulator {
  key: string;
  exerciseName: string;
  completedSets: number;
  bestLoad: number | null;
  bestPerformance: number | null;
  observations: ExerciseObservation[];
}

const GROUP_LABELS: Record<GymV2MuscleGroupId, string> = {
  back: 'Espalda',
  shoulders: 'Hombros',
  chest: 'Pecho',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  legs: 'Piernas',
  core: 'Core',
  other: 'Otros',
};

function dateFromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function addDays(ymd: string, delta: number): string {
  const date = dateFromYmd(ymd);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((dateFromYmd(end).getTime() - dateFromYmd(start).getTime()) / 86_400_000);
}

function mondayOf(ymd: string): string {
  const date = dateFromYmd(ymd);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function numericLoad(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Epley e1RM. Se usa solo como índice personal para sets de 1–15 reps. */
function estimatedStrength(load: number, reps: number): number | null {
  if (load <= 0 || reps < 1 || reps > 15) return null;
  return round(load * (1 + reps / 30), 2);
}

function percentDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return round(((current - previous) / previous) * 100);
}

function trendFromDelta(delta: number | null): GymV2Trend {
  if (delta === null) return 'unknown';
  if (delta > 2) return 'up';
  if (delta < -2) return 'down';
  return 'steady';
}

function bestObservationForExercise(
  session: GymSession,
  exerciseName: string,
): ExerciseObservation | null {
  const exercise = session.exercises.find((item) => item.exerciseName === exerciseName);
  if (!exercise) return null;

  let best: ExerciseObservation | null = null;
  for (const set of exercise.sets) {
    const load = numericLoad(set.load);
    const reps = set.reps;
    if (load === null || reps === null) continue;
    const performance = estimatedStrength(load, reps);
    if (performance === null) continue;
    const candidate: ExerciseObservation = { date: session.date, load, reps, performance };
    if (
      best === null ||
      candidate.performance > best.performance ||
      (candidate.performance === best.performance && candidate.load > best.load)
    ) {
      best = candidate;
    }
  }
  return best;
}

function buildExerciseTrends(sessions: readonly GymSession[]): GymV2ExerciseTrend[] {
  const byExercise = new Map<string, ExerciseAccumulator>();
  const ordered = sessions.slice().sort((a, b) => a.date.localeCompare(b.date));

  for (const session of ordered) {
    for (const exercise of session.exercises) {
      const normalized = exercise.exerciseName.trim().toLocaleLowerCase('es');
      if (!normalized) continue;

      const current =
        byExercise.get(normalized) ??
        ({
          key: `gym-v2:${normalized}`,
          exerciseName: exercise.exerciseName,
          completedSets: 0,
          bestLoad: null,
          bestPerformance: null,
          observations: [],
        } satisfies ExerciseAccumulator);

      current.completedSets += exercise.sets.length;
      const observation = bestObservationForExercise(session, exercise.exerciseName);
      if (observation) {
        current.observations.push(observation);
        current.bestLoad =
          current.bestLoad === null
            ? observation.load
            : Math.max(current.bestLoad, observation.load);
        current.bestPerformance =
          current.bestPerformance === null
            ? observation.performance
            : Math.max(current.bestPerformance, observation.performance);
      }
      byExercise.set(normalized, current);
    }
  }

  return [...byExercise.values()]
    .map((exercise) => {
      const latest = exercise.observations.at(-1) ?? null;
      const previous = exercise.observations.at(-2) ?? null;
      const baselineObservations = exercise.observations.slice(0, -1).slice(-4);
      const baselineAverage =
        baselineObservations.length === 0
          ? null
          : baselineObservations.reduce((sum, item) => sum + item.performance, 0) /
            baselineObservations.length;
      const deltaPercent = percentDelta(latest?.performance ?? null, previous?.performance ?? null);
      const baselineDeltaPercent = percentDelta(latest?.performance ?? null, baselineAverage);

      return {
        key: exercise.key,
        exerciseName: exercise.exerciseName,
        latestDate: latest?.date ?? '',
        latestLoad: latest?.load ?? null,
        latestReps: latest?.reps ?? null,
        latestPerformance: latest?.performance ?? null,
        previousPerformance: previous?.performance ?? null,
        bestLoad: exercise.bestLoad,
        bestPerformance: exercise.bestPerformance,
        deltaPercent,
        baselineDeltaPercent,
        trend: trendFromDelta(deltaPercent),
        sessionCount: exercise.observations.length,
        completedSets: exercise.completedSets,
        series: exercise.observations.map((item) => item.performance),
      } satisfies GymV2ExerciseTrend;
    })
    .sort(
      (a, b) =>
        b.sessionCount - a.sessionCount ||
        b.latestDate.localeCompare(a.latestDate) ||
        a.exerciseName.localeCompare(b.exerciseName, 'es'),
    );
}

function muscleGroup(exerciseName: string): GymV2MuscleGroupId {
  const name = exerciseName.toLocaleLowerCase('es');

  if (
    /prensa|sentadilla|femoral|cu[aá]dr|gemel|s[oó]leo|hip thrust|aductor|abductor|zancada|peso muerto/.test(
      name,
    )
  ) {
    return 'legs';
  }
  if (/dead bug|plancha|pallof|abdominal|copenhagen/.test(name)) return 'core';
  if (/jal[oó]n|dominada|remo|pulldown/.test(name)) return 'back';
  if (/press militar|elevaci[oó]n lateral|elevaciones laterales|face pull|delto/.test(name)) {
    return 'shoulders';
  }
  if (/press de banca|press banca|pecho|apertura/.test(name)) return 'chest';
  if (/tr[ií]ceps|press franc[eé]s|extensi[oó]n de tr[ií]ceps/.test(name)) return 'triceps';
  if (/b[ií]ceps|curl/.test(name)) return 'biceps';
  return 'other';
}

function buildMuscleGroups(
  sessions: readonly GymSession[],
  today: string,
): { groups: GymV2MuscleGroupSummary[]; coverage: number | null } {
  const start = addDays(today, -27);
  const counts = new Map<GymV2MuscleGroupId, number>();
  let totalSets = 0;
  let mappedSets = 0;

  for (const session of sessions) {
    if (session.date < start || session.date > today) continue;
    for (const exercise of session.exercises) {
      const sets = exercise.sets.length;
      if (sets <= 0) continue;
      const group = muscleGroup(exercise.exerciseName);
      totalSets += sets;
      if (group !== 'other') mappedSets += sets;
      counts.set(group, (counts.get(group) ?? 0) + sets);
    }
  }

  const groups = [...counts.entries()]
    .filter(([, sets]) => sets > 0)
    .map(([id, completedSets]) => ({
      id,
      label: GROUP_LABELS[id],
      completedSets,
      sharePercent: totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100),
    }))
    .sort((a, b) => b.completedSets - a.completedSets || a.label.localeCompare(b.label, 'es'));

  return {
    groups,
    coverage: totalSets === 0 ? null : Math.round((mappedSets / totalSets) * 100),
  };
}

function buildInsights(input: {
  currentWeekSessions: number;
  previousWeekSessions: number;
  weeklyTarget: number | null;
  trends: readonly GymV2ExerciseTrend[];
}): GymV2Insight[] {
  const insights: GymV2Insight[] = [];
  const weeklyDelta = input.currentWeekSessions - input.previousWeekSessions;

  if (input.weeklyTarget !== null && input.weeklyTarget > 0) {
    const remaining = Math.max(input.weeklyTarget - input.currentWeekSessions, 0);
    insights.push({
      id: 'weekly-frequency',
      title: remaining === 0 ? 'Frecuencia semanal cumplida' : 'Semana en curso',
      detail:
        remaining === 0
          ? `Ya registraste ${input.currentWeekSessions} sesión(es) frente a un objetivo de ${input.weeklyTarget}.`
          : `Llevás ${input.currentWeekSessions}/${input.weeklyTarget} sesión(es); faltan ${remaining} para completar la frecuencia objetivo.`,
      tone: remaining === 0 ? 'positive' : 'neutral',
    });
  } else if (input.currentWeekSessions > 0 || input.previousWeekSessions > 0) {
    insights.push({
      id: 'weekly-frequency',
      title: 'Frecuencia reciente',
      detail: `${input.currentWeekSessions} sesión(es) esta semana y ${input.previousWeekSessions} a esta altura de la semana anterior.`,
      tone: weeklyDelta < 0 ? 'watch' : weeklyDelta > 0 ? 'positive' : 'neutral',
    });
  }

  const comparable = input.trends
    .filter((item) => item.deltaPercent !== null)
    .sort((a, b) => Math.abs(b.deltaPercent ?? 0) - Math.abs(a.deltaPercent ?? 0));
  const strongestPositive = comparable.find((item) => item.trend === 'up');
  const strongestNegative = comparable.find((item) => item.trend === 'down');

  if (strongestPositive) {
    insights.push({
      id: 'exercise-progress',
      title: `${strongestPositive.exerciseName} mejoró`,
      detail: `La fuerza estimada del mejor set subió ${Math.abs(strongestPositive.deltaPercent ?? 0)}% frente a la sesión comparable anterior.`,
      tone: 'positive',
    });
  } else if (comparable.length > 0) {
    insights.push({
      id: 'exercise-progress',
      title: 'Rendimiento estable',
      detail:
        'Los ejercicios comparables se mantienen dentro de un margen pequeño frente a su sesión anterior.',
      tone: 'neutral',
    });
  }

  if (strongestNegative) {
    insights.push({
      id: 'exercise-watch',
      title: `${strongestNegative.exerciseName} bajó en la última comparación`,
      detail: `La fuerza estimada del mejor set fue ${Math.abs(strongestNegative.deltaPercent ?? 0)}% menor que en la sesión comparable anterior. Es una observación, no una causa.`,
      tone: 'watch',
    });
  }

  if (insights.length < 3) {
    const comparableCount = comparable.length;
    insights.push({
      id: 'comparison-coverage',
      title: 'Base de comparación',
      detail:
        comparableCount > 0
          ? `${comparableCount} ejercicio(s) ya tienen al menos dos sesiones comparables.`
          : 'Todavía faltan sesiones repetidas de los mismos ejercicios para construir tendencias personales.',
      tone: 'neutral',
    });
  }

  return insights.slice(0, 3);
}

export function computeGymV2Analytics(input: {
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
  weeklyTarget: number | null;
}): GymV2Analytics {
  const summaryByKey = new Map(input.summaries.map((summary) => [summary.key, summary]));
  const completed = input.sessions
    .filter((session) => session.date <= input.today)
    .filter((session) => summaryByKey.get(session.key)?.completed === true)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentWeekStart = mondayOf(input.today);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const elapsedWeekDays = Math.max(0, daysBetween(currentWeekStart, input.today));
  const previousComparisonEnd = addDays(previousWeekStart, elapsedWeekDays);
  const currentWeekSessions = completed.filter(
    (session) => session.date >= currentWeekStart && session.date <= input.today,
  ).length;
  const previousWeekSessions = completed.filter(
    (session) => session.date >= previousWeekStart && session.date <= previousComparisonEnd,
  ).length;
  const weeklyDelta = currentWeekSessions - previousWeekSessions;
  const adherencePercent =
    input.weeklyTarget !== null && input.weeklyTarget > 0
      ? Math.round((currentWeekSessions / input.weeklyTarget) * 100)
      : null;

  const exerciseTrends = buildExerciseTrends(completed);
  const comparable = exerciseTrends.filter((item) => item.trend !== 'unknown');
  const improvingExercises = comparable.filter((item) => item.trend === 'up').length;
  const stableExercises = comparable.filter((item) => item.trend === 'steady').length;
  const decliningExercises = comparable.filter((item) => item.trend === 'down').length;
  const baselineComparable = exerciseTrends.filter((item) => item.baselineDeltaPercent !== null);
  const aboveBaselineExercises = baselineComparable.filter(
    (item) => (item.baselineDeltaPercent ?? 0) > 2,
  ).length;

  let statusLabel = 'Construyendo base';
  let statusDetail = 'Faltan sesiones comparables para leer una tendencia personal.';
  if (comparable.length > 0) {
    if (improvingExercises > decliningExercises) {
      statusLabel = 'Progresando';
      statusDetail = `${improvingExercises} de ${comparable.length} ejercicio(s) comparables mejoraron en fuerza estimada.`;
    } else if (decliningExercises > improvingExercises) {
      statusLabel = 'Tendencia mixta';
      statusDetail = `${decliningExercises} de ${comparable.length} ejercicio(s) comparables bajaron en el último registro.`;
    } else {
      statusLabel = 'Estable';
      statusDetail = `${comparable.length} ejercicio(s) ya permiten comparación entre sesiones.`;
    }
  }

  const latestSession = completed.at(-1) ?? null;
  const muscle = buildMuscleGroups(completed, input.today);

  return {
    statusLabel,
    statusDetail,
    currentWeekSessions,
    previousWeekSessions,
    weeklyDelta,
    weeklyTarget: input.weeklyTarget,
    adherencePercent,
    improvingExercises,
    stableExercises,
    decliningExercises,
    comparableExercises: comparable.length,
    aboveBaselineExercises,
    baselineComparableExercises: baselineComparable.length,
    latestSessionDate: latestSession?.date ?? null,
    latestSessionLabel: latestSession?.dayLabel ?? latestSession?.routineName ?? null,
    exerciseTrends,
    muscleGroups: muscle.groups,
    muscleCoveragePercent: muscle.coverage,
    insights: buildInsights({
      currentWeekSessions,
      previousWeekSessions,
      weeklyTarget: input.weeklyTarget,
      trends: exerciseTrends,
    }),
    benchmark: {
      status: 'not-ready',
      label: 'Nivel externo pendiente',
      detail:
        'No se asigna principiante/intermedio/avanzado a cargas de máquinas o poleas sin una referencia compatible. Se agregará con fuente, ejercicio elegible y contexto corporal explícitos.',
    },
  };
}
