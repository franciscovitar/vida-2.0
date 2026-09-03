import type { GymSession, GymSessionSummary } from '@/types/gym';

export type GymPreviousWeekSession = {
  session: GymSession;
  displayLabel: string;
  labelInferred: boolean;
};

export type GymPreviousWeekSnapshot = {
  startDate: string;
  endDate: string;
  sessions: GymPreviousWeekSession[];
};

function parseIsoDate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return isoDate(parsed);
}

function mondayOf(date: string): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return date;
  const weekday = parsed.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return isoDate(parsed);
}

function normalizeExercise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function recognizedGymDayLabel(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('torso-a')) return 'Torso A';
  if (normalized.includes('torso-b')) return 'Torso B';
  if (normalized.includes('pierna')) return 'Pierna';
  return null;
}

function exerciseSimilarity(a: GymSession, b: GymSession): { overlap: number; score: number } {
  const aSet = new Set(a.exercises.map((exercise) => normalizeExercise(exercise.exerciseName)));
  const bSet = new Set(b.exercises.map((exercise) => normalizeExercise(exercise.exerciseName)));
  if (aSet.size === 0 || bSet.size === 0) return { overlap: 0, score: 0 };

  let overlap = 0;
  for (const name of aSet) if (bSet.has(name)) overlap += 1;
  const union = new Set([...aSet, ...bSet]).size;
  return { overlap, score: union > 0 ? overlap / union : 0 };
}

function inferGymDayLabel(session: GymSession, references: readonly GymSession[]): string | null {
  const candidates = references
    .map((reference) => {
      const label = recognizedGymDayLabel(reference.dayLabel);
      if (!label || reference.key === session.key) return null;
      const similarity = exerciseSimilarity(session, reference);
      return { label, ...similarity };
    })
    .filter((candidate): candidate is { label: string; overlap: number; score: number } =>
      Boolean(candidate),
    )
    .sort((a, b) => b.score - a.score || b.overlap - a.overlap);

  const best = candidates[0];
  const runnerUp = candidates[1];
  if (!best || best.overlap < 4 || best.score < 0.65) return null;
  if (runnerUp && best.score - runnerUp.score < 0.1) return null;
  return best.label;
}

/**
 * Devuelve la semana calendario completa inmediatamente anterior (lunes a domingo).
 * Se deriva en cada carga: al cambiar de lunes, el rango rota sin cron ni escritura.
 */
export function buildGymPreviousWeekSnapshot(input: {
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
}): GymPreviousWeekSnapshot {
  const currentWeekStart = mondayOf(input.today);
  const startDate = addDays(currentWeekStart, -7);
  const endDate = addDays(startDate, 6);
  const completedKeys = new Set(
    input.summaries.filter((summary) => summary.completed === true).map((summary) => summary.key),
  );

  const sessions = input.sessions
    .filter(
      (session) =>
        completedKeys.has(session.key) && session.date >= startDate && session.date <= endDate,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => {
      const observed = recognizedGymDayLabel(session.dayLabel);
      const inferred = observed ? null : inferGymDayLabel(session, input.sessions);
      return {
        session,
        displayLabel: observed ?? inferred ?? 'Entreno',
        labelInferred: !observed && Boolean(inferred),
      };
    });

  return { startDate, endDate, sessions };
}
