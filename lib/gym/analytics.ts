/**
 * Analítica pura de Gimnasio a partir de hechos confirmados (hábitos Sheets).
 * No inventa ceros ni emite recomendaciones clínicas.
 */
import type { GymProgressMetric } from '@/types/gym';

export type GymActivityDay = {
  date: string;
  /** true/false confirmado; null = sin dato (no es cero). */
  trained: boolean | null;
  durationMinutes: number | null;
};

export type GymAnalyticsInput = {
  days: readonly GymActivityDay[];
  /** Objetivo de frecuencia semanal cuando existe (p. ej. 3). */
  weeklyTarget: number | null;
  today: string;
};

function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export type GymAnalyticsResult = {
  activityDaysThisWeek: number | null;
  weeklyCompliance: number | null;
  averageDurationMinutes: number | null;
  currentStreak: number | null;
  weeklyVariation: number | null;
  coverageRatio: number | null;
  metrics: GymProgressMetric[];
};

/**
 * Calcula métricas solo cuando hay datos reales.
 * trained=null no cuenta como fallo ni como sesión.
 */
export function computeGymAnalytics(input: GymAnalyticsInput): GymAnalyticsResult {
  const known = input.days.filter((day) => day.trained !== null);
  const trainedDays = known.filter((day) => day.trained === true);
  const withDuration = trainedDays.filter((day) => day.durationMinutes !== null);

  const coverageRatio =
    input.days.length === 0 ? null : known.length === 0 ? null : known.length / input.days.length;

  const weekStart = mondayOf(input.today);
  const prevWeekStart = addDays(weekStart, -7);
  const thisWeek = known.filter(
    (day) => day.date >= weekStart && day.date <= input.today && day.trained === true,
  );
  const prevWeek = known.filter(
    (day) => day.date >= prevWeekStart && day.date < weekStart && day.trained === true,
  );

  const activityDaysThisWeek = known.some((day) => day.date >= weekStart) ? thisWeek.length : null;

  let weeklyCompliance: number | null = null;
  if (activityDaysThisWeek !== null && input.weeklyTarget && input.weeklyTarget > 0) {
    weeklyCompliance = Math.min(100, Math.round((activityDaysThisWeek / input.weeklyTarget) * 100));
  }

  let averageDurationMinutes: number | null = null;
  if (withDuration.length > 0) {
    const sum = withDuration.reduce((acc, day) => acc + (day.durationMinutes ?? 0), 0);
    averageDurationMinutes = Math.round(sum / withDuration.length);
  }

  let currentStreak: number | null = null;
  if (known.length > 0) {
    let streak = 0;
    let cursor = input.today;
    for (let i = 0; i < 60; i += 1) {
      const hit = known.find((day) => day.date === cursor);
      if (!hit || hit.trained === null) break;
      if (hit.trained !== true) break;
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    currentStreak = streak > 0 ? streak : known.some((d) => d.trained === true) ? 0 : null;
  }

  let weeklyVariation: number | null = null;
  if (
    known.some((day) => day.date >= weekStart) &&
    known.some((day) => day.date >= prevWeekStart && day.date < weekStart)
  ) {
    weeklyVariation = thisWeek.length - prevWeek.length;
  }

  const metrics: GymProgressMetric[] = [];

  metrics.push({
    key: 'activity-days-week',
    label: 'Días con ejercicio (semana)',
    value: activityDaysThisWeek === null ? null : String(activityDaysThisWeek),
    unit: activityDaysThisWeek === null ? null : 'días',
    context: activityDaysThisWeek === null ? 'Sin datos confirmados esta semana.' : null,
    kind: activityDaysThisWeek === null ? 'absent' : 'confirmed',
  });

  metrics.push({
    key: 'weekly-compliance',
    label: 'Cumplimiento de frecuencia',
    value: weeklyCompliance === null ? null : String(weeklyCompliance),
    unit: weeklyCompliance === null ? null : '%',
    context:
      weeklyCompliance === null
        ? 'Sin objetivo o sin datos suficientes.'
        : input.weeklyTarget
          ? `Objetivo ${input.weeklyTarget}/semana`
          : null,
    kind: weeklyCompliance === null ? 'absent' : 'confirmed',
  });

  metrics.push({
    key: 'avg-duration',
    label: 'Duración media',
    value: averageDurationMinutes === null ? null : String(averageDurationMinutes),
    unit: averageDurationMinutes === null ? null : 'min',
    context:
      averageDurationMinutes === null
        ? 'Duración no registrada en las fuentes actuales.'
        : 'Solo sesiones con duración confirmada.',
    kind: averageDurationMinutes === null ? 'absent' : 'confirmed',
  });

  metrics.push({
    key: 'streak',
    label: 'Racha actual',
    value: currentStreak === null ? null : String(currentStreak),
    unit: currentStreak === null ? null : 'días',
    context: currentStreak === null ? 'Sin racha calculable.' : null,
    kind: currentStreak === null ? 'absent' : 'confirmed',
  });

  metrics.push({
    key: 'weekly-variation',
    label: 'Variación semanal',
    value: weeklyVariation === null ? null : String(weeklyVariation),
    unit: weeklyVariation === null ? null : 'días',
    context:
      weeklyVariation === null
        ? 'Sin semanas comparables.'
        : weeklyVariation === 0
          ? 'Igual que la semana anterior.'
          : weeklyVariation > 0
            ? 'Más días que la semana anterior.'
            : 'Menos días que la semana anterior.',
    kind: weeklyVariation === null ? 'absent' : 'trend',
  });

  metrics.push({
    key: 'coverage',
    label: 'Cobertura de datos',
    value: coverageRatio === null ? null : `${Math.round(coverageRatio * 100)}`,
    unit: coverageRatio === null ? null : '%',
    context:
      coverageRatio === null
        ? 'Sin ventana de cobertura.'
        : coverageRatio < 1
          ? 'Cobertura incompleta; los huecos no se tratan como cero.'
          : 'Cobertura completa en la ventana.',
    kind: coverageRatio === null ? 'absent' : coverageRatio < 1 ? 'coverage' : 'confirmed',
  });

  return {
    activityDaysThisWeek,
    weeklyCompliance,
    averageDurationMinutes,
    currentStreak,
    weeklyVariation,
    coverageRatio,
    metrics,
  };
}
