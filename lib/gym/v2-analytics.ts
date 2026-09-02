import { estimateEpleyOneRepMax } from '@/lib/gym/strength-estimation';
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
    const performance = estimateEpleyOneRepMax(load, reps);
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
  if (/elevaci[oó]n lateral|elevaciones laterales|press militar|face ?pull|p[aá]jaro|deltoid/.test(name)) {
    return 'shoulders';
  }
  if (/press banca|press de pecho|apertura|pec deck|pecho/.test(name)) return 'chest';
  if (/b[ií]ceps|curl/.test(name)) return 'biceps';
  if (/tr[ií]ceps|franc[eé]s|extensi[oó]n.*polea|pushdown/.test(name)) return 'triceps';
  return 'other';
}

function buildMuscleGroups(sessions: readonly GymSession[], today: string): {
  groups: GymV2MuscleGroupSummary[];
  coveragePercent: number | null;
} {
  const cutoff = addDays(today, -27);
  const counts = new Map<GymV2MuscleGroupId, number>();
  let total = 0;
  let mapped = 0;

  for (const session of sessions) {
    if (session.date < cutoff || session.date > today) continue;
    for (const exercise of session.exercises) {
      const group = muscleGroup(exercise.exerciseName);
      const completedSets = exercise.sets.length;
      if (completedSets === 0) continue;
      total += completedSets;
      if (group !== 'other') mapped += completedSets;
      counts.set(group, (counts.get(group) ?? 0) + completedSets);
    }
  }

  const groups = [...counts.entries()]
    .map(([id, completedSets]) => ({
      id,
      label: GROUP_LABELS[id],
      completedSets,
      sharePercent: total === 0 ? 0 : Math.round((completedSets / total) * 100),
    }))
    .sort((a, b) => b.completedSets - a.completedSets || a.label.localeCompare(b.label, 'es'));

  return {
    groups,
    coveragePercent: total === 0 ? null : Math.round((mapped / total) * 100),
  };
}

function summaryDate(summary: GymSessionSummary): string | null {
  return summary.date || null;
}

function isCompleteSession(session: GymSession): boolean {
  return session.status === 'complete';
}

function completedSessionsThrough(sessions: readonly GymSession[], end: string): GymSession[] {
  return sessions.filter((session) => isCompleteSession(session) && session.date <= end);
}

function buildInsights(input: {
  currentWeekSessions: number;
  previousWeekSessions: number;
  exerciseTrends: readonly GymV2ExerciseTrend[];
}): GymV2Insight[] {
  const insights: GymV2Insight[] = [];

  if (input.currentWeekSessions > input.previousWeekSessions) {
    insights.push({
      id: 'frequency',
      title: 'Más frecuencia esta semana',
      detail: `${input.currentWeekSessions} sesión(es) a esta altura, frente a ${input.previousWeekSessions} la semana anterior.`,
      tone: 'positive',
    });
  } else if (input.currentWeekSessions < input.previousWeekSessions) {
    insights.push({
      id: 'frequency',
      title: 'Frecuencia reciente',
      detail: `${input.currentWeekSessions} sesión(es) esta semana y ${input.previousWeekSessions} a esta altura de la semana anterior.`,
      tone: 'watch',
    });
  } else {
    insights.push({
      id: 'frequency',
      title: 'Frecuencia estable',
      detail: `${input.currentWeekSessions} sesión(es) a esta altura de ambas semanas.`,
      tone: 'neutral',
    });
  }

  const strongestGain = input.exerciseTrends
    .filter((exercise) => exercise.deltaPercent !== null && exercise.deltaPercent > 2)
    .slice()
    .sort((a, b) => (b.deltaPercent ?? 0) - (a.deltaPercent ?? 0))[0];

  if (strongestGain?.deltaPercent !== null && strongestGain?.deltaPercent !== undefined) {
    insights.push({
      id: 'gain',
      title: `${strongestGain.exerciseName} mejoró`,
      detail: `La fuerza estimada del mejor set subió ${round(strongestGain.deltaPercent)}% frente a la sesión comparable anterior.`,
      tone: 'positive',
    });
  } else {
    const strongestDrop = input.exerciseTrends
      .filter((exercise) => exercise.deltaPercent !== null && exercise.deltaPercent < -2)
      .slice()
      .sort((a, b) => (a.deltaPercent ?? 0) - (b.deltaPercent ?? 0))[0];
    if (strongestDrop?.deltaPercent !== null && strongestDrop?.deltaPercent !== undefined) {
      insights.push({
        id: 'drop',
        title: `${strongestDrop.exerciseName} bajó`,
        detail: `La fuerza estimada del mejor set quedó ${round(Math.abs(strongestDrop.deltaPercent))}% debajo de la sesión comparable anterior.`,
        tone: 'watch',
      });
    }
  }

  const comparableCount = input.exerciseTrends.filter((exercise) => exercise.sessionCount >= 2).length;
  insights.push({
    id: 'coverage',
    title: 'Base de comparación',
    detail:
      comparableCount === 0
        ? 'Todavía faltan sesiones repetidas de los mismos ejercicios para construir tendencias personales.'
        : `${comparableCount} ejercicio(s) ya tienen al menos dos sesiones comparables.`,
    tone: 'neutral',
  });

  return insights.slice(0, 3);
}

export function computeGymV2Analytics(input: {
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  weeklyTarget: number | null;
  today: string;
}): GymV2Analytics {
  const completeSessions = completedSessionsThrough(input.sessions, input.today);
  const weekStart = mondayOf(input.today);
  const weekdayOffset = daysBetween(weekStart, input.today);
  const previousWeekStart = addDays(weekStart, -7);
  const previousWeekComparableEnd = addDays(previousWeekStart, weekdayOffset);

  const currentWeekSessions = completeSessions.filter(
    (session) => session.date >= weekStart && session.date <= input.today,
  ).length;
  const previousWeekSessions = completeSessions.filter(
    (session) =>
      session.date >= previousWeekStart && session.date <= previousWeekComparableEnd,
  ).length;
  const weeklyDelta = currentWeekSessions - previousWeekSessions;
  const exerciseTrends = buildExerciseTrends(completeSessions);
  const comparable = exerciseTrends.filter((exercise) => exercise.sessionCount >= 2);
  const improvingExercises = comparable.filter((exercise) => exercise.trend === 'up').length;
  const stableExercises = comparable.filter((exercise) => exercise.trend === 'steady').length;
  const decliningExercises = comparable.filter((exercise) => exercise.trend === 'down').length;
  const baselineComparable = exerciseTrends.filter((exercise) => exercise.baselineDeltaPercent !== null);
  const aboveBaselineExercises = baselineComparable.filter(
    (exercise) => (exercise.baselineDeltaPercent ?? 0) > 2,
  ).length;
  const latestSession = completeSessions.slice().sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const latestSummary = input.summaries
    .filter((summary) => summaryDate(summary) !== null && summary.date <= input.today)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const muscle = buildMuscleGroups(completeSessions, input.today);
  const adherencePercent =
    input.weeklyTarget && input.weeklyTarget > 0
      ? Math.round((currentWeekSessions / input.weeklyTarget) * 100)
      : null;

  let statusLabel = 'Construyendo base';
  let statusDetail = 'Faltan sesiones comparables para leer una tendencia personal.';
  if (comparable.length > 0) {
    if (improvingExercises > decliningExercises && improvingExercises > 0) {
      statusLabel = 'Progresando';
      statusDetail = `${improvingExercises} de ${comparable.length} ejercicio(s) comparables mejoraron en fuerza estimada.`;
    } else if (decliningExercises > improvingExercises && decliningExercises > 0) {
      statusLabel = 'Tendencia mixta';
      statusDetail = `${decliningExercises} ejercicio(s) bajaron frente a su sesión comparable anterior.`;
    } else {
      statusLabel = 'Estable';
      statusDetail = `${stableExercises} ejercicio(s) están dentro de una variación pequeña frente a su sesión anterior.`;
    }
  }

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
    latestSessionLabel: latestSummary?.date ?? latestSession?.date ?? null,
    exerciseTrends,
    muscleGroups: muscle.groups,
    muscleCoveragePercent: muscle.coveragePercent,
    insights: buildInsights({ currentWeekSessions, previousWeekSessions, exerciseTrends }),
    benchmark: {
      status: 'not-ready',
      label: 'Nivel externo pendiente',
      detail:
        'Las referencias externas se muestran aparte y solo cuando la carga es comparable con una fuente explícita.',
    },
  };
}
