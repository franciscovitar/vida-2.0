import type { GymSession, GymSessionSummary } from '@/types/gym';

export interface GymWeeklyProgressPoint {
  key: string;
  weekStart: string;
  weekEnd: string;
  label: string;
  sessions: number;
  completedSets: number;
  volumeLoad: number;
  durationMinutes: number;
  adherencePercent: number | null;
}

export interface GymExerciseRecord {
  key: string;
  exerciseName: string;
  latestDate: string;
  latestLoad: number | null;
  previousLoad: number | null;
  loadDelta: number | null;
  bestLoad: number | null;
  bestLoadDate: string | null;
  bestSetVolume: number | null;
  bestSetVolumeDate: string | null;
  completedSets: number;
}

export interface GymSessionAnalytics {
  completedSessions: number;
  trackedSessions: number;
  completionRate: number | null;
  totalCompletedSets: number;
  totalVolumeLoad: number;
  averageSessionVolume: number | null;
  averageDurationMinutes: number | null;
  longestSessionMinutes: number | null;
  bestSessionVolume: number | null;
  volumeCoveragePercent: number | null;
  weekly: readonly GymWeeklyProgressPoint[];
  exerciseRecords: readonly GymExerciseRecord[];
}

export interface GymSessionAnalyticsInput {
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
  weeklyTarget: number | null;
  weeks?: number;
}

interface ExerciseObservation {
  date: string;
  load: number | null;
  bestSetVolume: number | null;
}

interface ExerciseAccumulator {
  key: string;
  exerciseName: string;
  completedSets: number;
  bestLoad: number | null;
  bestLoadDate: string | null;
  bestSetVolume: number | null;
  bestSetVolumeDate: string | null;
  observations: ExerciseObservation[];
}

function dateFromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function addDays(ymd: string, delta: number): string {
  const date = dateFromYmd(ymd);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function mondayOf(ymd: string): string {
  const date = dateFromYmd(ymd);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function compactDate(ymd: string): string {
  const [, month, day] = ymd.split('-');
  return `${day}/${month}`;
}

function numericLoad(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sessionSets(session: GymSession) {
  return session.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      exerciseKey: exercise.key,
      exerciseName: exercise.exerciseName,
      set,
    })),
  );
}

function sessionVolume(session: GymSession): {
  volume: number;
  coveredSets: number;
  completedSets: number;
} {
  const sets = sessionSets(session);
  let volume = 0;
  let coveredSets = 0;

  for (const item of sets) {
    const load = numericLoad(item.set.load);
    if (load === null || item.set.reps === null) continue;
    volume += load * item.set.reps;
    coveredSets += 1;
  }

  return {
    volume: round(volume),
    coveredSets,
    completedSets: sets.length,
  };
}

function buildWeeklyPoints(input: {
  sessions: readonly GymSession[];
  today: string;
  weeklyTarget: number | null;
  weeks: number;
}): GymWeeklyProgressPoint[] {
  const currentWeek = mondayOf(input.today);
  const points: GymWeeklyProgressPoint[] = [];

  for (let offset = input.weeks - 1; offset >= 0; offset -= 1) {
    const weekStart = addDays(currentWeek, offset * -7);
    const weekEnd = addDays(weekStart, 6);
    const sessions = input.sessions.filter(
      (session) => session.date >= weekStart && session.date <= weekEnd,
    );
    const facts = sessions.map(sessionVolume);

    const completedSets = facts.reduce((sum, item) => sum + item.completedSets, 0);
    const volumeLoad = round(facts.reduce((sum, item) => sum + item.volume, 0));
    const durationMinutes = sessions.reduce(
      (sum, session) => sum + (session.durationMinutes ?? 0),
      0,
    );

    points.push({
      key: weekStart,
      weekStart,
      weekEnd,
      label: `${compactDate(weekStart)}–${compactDate(weekEnd)}`,
      sessions: sessions.length,
      completedSets,
      volumeLoad,
      durationMinutes,
      adherencePercent:
        input.weeklyTarget !== null && input.weeklyTarget > 0
          ? Math.round((sessions.length / input.weeklyTarget) * 100)
          : null,
    });
  }

  return points;
}

function buildExerciseRecords(sessions: readonly GymSession[]): GymExerciseRecord[] {
  const byExercise = new Map<string, ExerciseAccumulator>();

  for (const session of sessions.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    for (const exercise of session.exercises) {
      const normalized = exercise.exerciseName.trim().toLocaleLowerCase('es');
      if (!normalized) continue;

      const accumulator =
        byExercise.get(normalized) ??
        ({
          key: `exercise-record:${normalized}`,
          exerciseName: exercise.exerciseName,
          completedSets: 0,
          bestLoad: null,
          bestLoadDate: null,
          bestSetVolume: null,
          bestSetVolumeDate: null,
          observations: [],
        } satisfies ExerciseAccumulator);

      let sessionBestLoad: number | null = null;
      let sessionBestSetVolume: number | null = null;

      for (const set of exercise.sets) {
        accumulator.completedSets += 1;
        const load = numericLoad(set.load);
        if (load !== null && (sessionBestLoad === null || load > sessionBestLoad)) {
          sessionBestLoad = load;
        }

        if (load !== null && set.reps !== null) {
          const setVolume = round(load * set.reps);
          if (sessionBestSetVolume === null || setVolume > sessionBestSetVolume) {
            sessionBestSetVolume = setVolume;
          }
        }
      }

      if (
        sessionBestLoad !== null &&
        (accumulator.bestLoad === null || sessionBestLoad > accumulator.bestLoad)
      ) {
        accumulator.bestLoad = sessionBestLoad;
        accumulator.bestLoadDate = session.date;
      }

      if (
        sessionBestSetVolume !== null &&
        (accumulator.bestSetVolume === null || sessionBestSetVolume > accumulator.bestSetVolume)
      ) {
        accumulator.bestSetVolume = sessionBestSetVolume;
        accumulator.bestSetVolumeDate = session.date;
      }

      if (sessionBestLoad !== null || sessionBestSetVolume !== null) {
        accumulator.observations.push({
          date: session.date,
          load: sessionBestLoad,
          bestSetVolume: sessionBestSetVolume,
        });
      }

      byExercise.set(normalized, accumulator);
    }
  }

  return [...byExercise.values()]
    .map((exercise) => {
      const loads = exercise.observations
        .filter((item) => item.load !== null)
        .map((item) => ({ date: item.date, load: item.load! }));
      const latest = loads.at(-1) ?? null;
      const previous = loads.at(-2) ?? null;

      return {
        key: exercise.key,
        exerciseName: exercise.exerciseName,
        latestDate: latest?.date ?? exercise.observations.at(-1)?.date ?? '',
        latestLoad: latest?.load ?? null,
        previousLoad: previous?.load ?? null,
        loadDelta: latest && previous ? round(latest.load - previous.load) : null,
        bestLoad: exercise.bestLoad,
        bestLoadDate: exercise.bestLoadDate,
        bestSetVolume: exercise.bestSetVolume,
        bestSetVolumeDate: exercise.bestSetVolumeDate,
        completedSets: exercise.completedSets,
      };
    })
    .sort(
      (a, b) =>
        b.latestDate.localeCompare(a.latestDate) ||
        b.completedSets - a.completedSets ||
        a.exerciseName.localeCompare(b.exerciseName, 'es'),
    );
}

export function computeGymSessionAnalytics(input: GymSessionAnalyticsInput): GymSessionAnalytics {
  const summaryByKey = new Map(input.summaries.map((summary) => [summary.key, summary]));
  const completedSessions = input.sessions
    .filter((session) => session.date <= input.today)
    .filter((session) => summaryByKey.get(session.key)?.completed === true)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const trackedSummaries = input.summaries.filter(
    (summary) => summary.date <= input.today && summary.completed !== null,
  );
  const completedSummaryCount = trackedSummaries.filter(
    (summary) => summary.completed === true,
  ).length;

  const facts = completedSessions.map(sessionVolume);
  const totalCompletedSets = facts.reduce((sum, item) => sum + item.completedSets, 0);
  const coveredSets = facts.reduce((sum, item) => sum + item.coveredSets, 0);
  const totalVolumeLoad = round(facts.reduce((sum, item) => sum + item.volume, 0));
  const durations = completedSessions
    .map((session) => session.durationMinutes)
    .filter((value): value is number => value !== null);

  return {
    completedSessions: completedSessions.length,
    trackedSessions: trackedSummaries.length,
    completionRate:
      trackedSummaries.length === 0
        ? null
        : Math.round((completedSummaryCount / trackedSummaries.length) * 100),
    totalCompletedSets,
    totalVolumeLoad,
    averageSessionVolume:
      completedSessions.length === 0 ? null : round(totalVolumeLoad / completedSessions.length),
    averageDurationMinutes:
      durations.length === 0
        ? null
        : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    longestSessionMinutes: durations.length === 0 ? null : Math.max(...durations),
    bestSessionVolume: facts.length === 0 ? null : Math.max(...facts.map((item) => item.volume)),
    volumeCoveragePercent:
      totalCompletedSets === 0 ? null : Math.round((coveredSets / totalCompletedSets) * 100),
    weekly: buildWeeklyPoints({
      sessions: completedSessions,
      today: input.today,
      weeklyTarget: input.weeklyTarget,
      weeks: Math.min(12, Math.max(4, input.weeks ?? 8)),
    }),
    exerciseRecords: buildExerciseRecords(completedSessions),
  };
}
