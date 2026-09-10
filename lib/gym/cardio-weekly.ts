import type { GymCardioContribution, GymCardioSession, GymWeeklyCardioSummary } from '@/types/gym';

export const DAILY_STEPS_TARGET = 8_000;
export const WEEKLY_STEPS_TARGET = DAILY_STEPS_TARGET * 7;
export const WEEKLY_BIKE_TARGET_MINUTES = 120;
export const WEEKLY_FOOTBALL_TARGET_MATCHES = 1;

export const WALKING_FALLBACK_STEPS_PER_MINUTE = 100;
export const WALKING_FALLBACK_MET = 3.5;
export const BIKE_REFERENCE_MET = 5;
export const FOOTBALL_REFERENCE_MET = 7;
export const FOOTBALL_REFERENCE_MINUTES = 60;

export const WEEKLY_CARDIO_TARGET_MET_MINUTES = Math.round(
  (WEEKLY_STEPS_TARGET / WALKING_FALLBACK_STEPS_PER_MINUTE) * WALKING_FALLBACK_MET +
    WEEKLY_BIKE_TARGET_MINUTES * BIKE_REFERENCE_MET +
    WEEKLY_FOOTBALL_TARGET_MATCHES * FOOTBALL_REFERENCE_MINUTES * FOOTBALL_REFERENCE_MET,
);

const DAY_MS = 86_400_000;

type CardioHealthMetric = {
  id: string;
  series: readonly (number | null)[];
};

function dateFromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function addDays(ymd: string, delta: number): string {
  return new Date(dateFromYmd(ymd).getTime() + delta * DAY_MS).toISOString().slice(0, 10);
}

function mondayOf(ymd: string): string {
  const date = dateFromYmd(ymd);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return date.toISOString().slice(0, 10);
}

function rounded(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundedSteps(value: number): number {
  if (value <= 0) return 0;
  return Math.max(100, Math.round(value / 100) * 100);
}

function metricById(metrics: readonly CardioHealthMetric[], id: string): CardioHealthMetric | null {
  return metrics.find((metric) => metric.id === id) ?? null;
}

function bikeMet(session: GymCardioSession): {
  met: number;
  confidence: GymCardioContribution['confidence'];
  detail: string;
} {
  const watts = session.averagePowerWatts;
  if (watts !== null && watts > 0) {
    const met =
      watts <= 30
        ? 3.5
        : watts <= 50
          ? 4
          : watts <= 60
            ? 5
            : watts <= 80
              ? 5.8
              : watts <= 100
                ? 6
                : watts <= 125
                  ? 6.8
                  : watts <= 150
                    ? 8
                    : watts <= 199
                      ? 10.3
                      : watts <= 229
                        ? 10.8
                        : watts <= 250
                          ? 12.5
                          : watts <= 305
                            ? 13.8
                            : 16.3;
    return {
      met,
      confidence: 'high',
      detail: `${rounded(watts, 0)} W · MET del Compendium 2024`,
    };
  }

  if (session.rpe !== null) {
    const met =
      session.rpe <= 2
        ? 3.5
        : session.rpe <= 3
          ? 4
          : session.rpe <= 5
            ? 5
            : session.rpe <= 6
              ? 6.8
              : 9;
    return {
      met,
      confidence: 'medium',
      detail: `RPE ${rounded(session.rpe)} · intensidad aproximada`,
    };
  }

  if (session.activityType.toLowerCase() === 'zone2') {
    return {
      met: BIKE_REFERENCE_MET,
      confidence: 'low',
      detail: 'Rol Zona 2 · proxy conservador de bici fija sin watts',
    };
  }

  return {
    met: 6.8,
    confidence: 'low',
    detail: 'Bicicleta fija general · sin watts/RPE',
  };
}

function footballMet(session: GymCardioSession): {
  met: number;
  confidence: GymCardioContribution['confidence'];
  detail: string;
} {
  const competitive =
    (session.rpe !== null && session.rpe >= 8) ||
    /compet|partido intenso|torneo/i.test(session.note ?? '');
  if (competitive) {
    return {
      met: 9.5,
      confidence: session.rpe !== null ? 'medium' : 'low',
      detail: 'Fútbol competitivo · Compendium 2024',
    };
  }
  return {
    met: FOOTBALL_REFERENCE_MET,
    confidence: session.rpe !== null ? 'medium' : 'low',
    detail: 'Fútbol general/casual · Compendium 2024',
  };
}

function walkingMet(speedKmh: number): number | null {
  if (!Number.isFinite(speedKmh) || speedKmh < 4 || speedKmh > 7.1) return null;
  if (speedKmh < 4.8) return 3;
  if (speedKmh < 5.6) return 3.8;
  if (speedKmh < 6.4) return 4.8;
  return 5.5;
}

function kindFor(session: GymCardioSession): GymCardioContribution['kind'] {
  const activity = `${session.activityType} ${session.modality}`.toLowerCase();
  if (/f[uú]tbol|football|soccer/.test(activity)) return 'football';
  if (/bici|bike|cycl|cicl/.test(activity)) return 'bike';
  return 'other';
}

function contributionFromSession(session: GymCardioSession): GymCardioContribution | null {
  if (session.durationMinutes === null || session.durationMinutes <= 0) return null;
  const kind = kindFor(session);
  if (kind === 'other') return null;
  const intensity = kind === 'football' ? footballMet(session) : bikeMet(session);
  return {
    key: session.key,
    date: session.date,
    kind,
    label: kind === 'football' ? 'Fútbol' : 'Bicicleta',
    durationMinutes: rounded(session.durationMinutes, 1),
    met: intensity.met,
    metMinutes: rounded(session.durationMinutes * intensity.met, 0),
    confidence: intensity.confidence,
    detail: intensity.detail,
  };
}

export function buildWeeklyCardioSummary(input: {
  cardioSessions: readonly GymCardioSession[];
  healthMetrics: readonly CardioHealthMetric[];
  healthPeriodStart: string | null;
  today: string;
  cardioSourceAvailable: boolean;
  healthSourceAvailable: boolean;
}): GymWeeklyCardioSummary {
  const weekStart = mondayOf(input.today);
  const weekSessions = input.cardioSessions.filter(
    (session) => session.date >= weekStart && session.date <= input.today,
  );
  const contributions: GymCardioContribution[] = weekSessions
    .map(contributionFromSession)
    .filter((item): item is GymCardioContribution => item !== null);

  const weeklyBikeMinutes = rounded(
    weekSessions.reduce((sum, session) => {
      if (kindFor(session) !== 'bike' || session.durationMinutes === null) return sum;
      return sum + Math.max(session.durationMinutes, 0);
    }, 0),
    1,
  );
  const weeklyFootballMatches = weekSessions.filter(
    (session) => kindFor(session) === 'football',
  ).length;

  let weeklySteps = 0;
  let estimatedWalkingDays = 0;

  const steps = metricById(input.healthMetrics, 'steps');
  const distance = metricById(input.healthMetrics, 'distance');
  const speed = metricById(input.healthMetrics, 'walkingSpeed');

  if (input.healthSourceAvailable && input.healthPeriodStart && steps) {
    const count = Math.max(
      steps.series.length,
      distance?.series.length ?? 0,
      speed?.series.length ?? 0,
    );

    for (let index = 0; index < count; index += 1) {
      const date = addDays(input.healthPeriodStart, index);
      if (date < weekStart || date > input.today) continue;

      const rawSteps = steps.series[index] ?? null;
      const daySteps =
        rawSteps !== null && Number.isFinite(rawSteps) && rawSteps > 0 ? rawSteps : null;
      const km = distance?.series[index] ?? null;
      const kmh = speed?.series[index] ?? null;

      if (daySteps !== null) weeklySteps += daySteps;

      const measuredMet = kmh !== null ? walkingMet(kmh) : null;
      const measuredMinutes =
        km !== null && kmh !== null && km > 0 && kmh > 0 ? (km / kmh) * 60 : null;
      const measuredUsable =
        measuredMet !== null &&
        measuredMinutes !== null &&
        Number.isFinite(measuredMinutes) &&
        measuredMinutes > 0 &&
        measuredMinutes <= 300;

      if (measuredUsable) {
        contributions.push({
          key: `walking-${date}`,
          date,
          kind: 'walking',
          label: 'Caminata',
          durationMinutes: rounded(measuredMinutes, 1),
          met: measuredMet,
          metMinutes: rounded(measuredMinutes * measuredMet, 0),
          confidence: 'low',
          detail: `${daySteps === null ? 'Pasos no disponibles' : `${rounded(daySteps, 0)} pasos`} · ${rounded(kmh!, 1)} km/h · ${rounded(km!, 1)} km; estimación con datos de movimiento`,
        });
        continue;
      }

      if (daySteps !== null) {
        const estimatedMinutes = daySteps / WALKING_FALLBACK_STEPS_PER_MINUTE;
        estimatedWalkingDays += 1;
        contributions.push({
          key: `walking-${date}`,
          date,
          kind: 'walking',
          label: 'Pasos',
          durationMinutes: rounded(estimatedMinutes, 1),
          met: WALKING_FALLBACK_MET,
          metMinutes: rounded(estimatedMinutes * WALKING_FALLBACK_MET, 0),
          confidence: 'low',
          detail: `${rounded(daySteps, 0)} pasos · proxy ${WALKING_FALLBACK_STEPS_PER_MINUTE} pasos/min × ${WALKING_FALLBACK_MET} MET por falta de velocidad/distancia usable`,
        });
      }
    }
  }

  contributions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'es'),
  );
  const totalMetMinutes = rounded(
    contributions.reduce((sum, contribution) => sum + contribution.metMinutes, 0),
    0,
  );
  const targetMetMinutes = WEEKLY_CARDIO_TARGET_MET_MINUTES;
  const progressPercent = Math.max(0, Math.round((totalMetMinutes / targetMetMinutes) * 100));
  const remainingMetMinutes = Math.max(targetMetMinutes - totalMetMinutes, 0);
  const moderateEquivalentMinutes = rounded(totalMetMinutes / 4, 0);

  const weeklyStepsRounded = Math.round(weeklySteps);
  const remainingSteps = Math.max(WEEKLY_STEPS_TARGET - weeklyStepsRounded, 0);
  const remainingBikeMinutes = rounded(
    Math.max(WEEKLY_BIKE_TARGET_MINUTES - weeklyBikeMinutes, 0),
    1,
  );
  const remainingFootballMatches = Math.max(
    WEEKLY_FOOTBALL_TARGET_MATCHES - weeklyFootballMatches,
    0,
  );

  const remainingEquivalentSteps = roundedSteps(
    (remainingMetMinutes / WALKING_FALLBACK_MET) * WALKING_FALLBACK_STEPS_PER_MINUTE,
  );
  const remainingEquivalentBikeMinutes = rounded(
    remainingMetMinutes / BIKE_REFERENCE_MET,
    0,
  );
  const remainingEquivalentFootballMatches = rounded(
    remainingMetMinutes / (FOOTBALL_REFERENCE_MET * FOOTBALL_REFERENCE_MINUTES),
    1,
  );

  const bothUnavailable = !input.cardioSourceAvailable && !input.healthSourceAvailable;
  const oneUnavailable = !input.cardioSourceAvailable || !input.healthSourceAvailable;
  const status: GymWeeklyCardioSummary['status'] = bothUnavailable
    ? 'unavailable'
    : contributions.length === 0
      ? oneUnavailable
        ? 'partial'
        : 'empty'
      : oneUnavailable
        ? 'partial'
        : 'ready';

  return {
    status,
    targetMetMinutes,
    totalMetMinutes,
    remainingMetMinutes,
    progressPercent,
    moderateEquivalentMinutes,
    contributions,
    uncreditedWalkingDays: 0,
    estimatedWalkingDays,
    weeklySteps: weeklyStepsRounded,
    weeklyStepsTarget: WEEKLY_STEPS_TARGET,
    remainingSteps,
    weeklyBikeMinutes,
    weeklyBikeMinutesTarget: WEEKLY_BIKE_TARGET_MINUTES,
    remainingBikeMinutes,
    weeklyFootballMatches,
    weeklyFootballMatchesTarget: WEEKLY_FOOTBALL_TARGET_MATCHES,
    remainingFootballMatches,
    remainingEquivalentSteps,
    remainingEquivalentBikeMinutes,
    remainingEquivalentFootballMatches,
    note: `La cuota equivalente representa tu plan base: ${DAILY_STEPS_TARGET.toLocaleString('es-AR')} pasos/día + ${WEEKLY_BIKE_TARGET_MINUTES} min de bici + ${WEEKLY_FOOTBALL_TARGET_MATCHES} partido/semana. Los pasos siempre suman: si faltan velocidad/distancia se estiman con ${WALKING_FALLBACK_STEPS_PER_MINUTE} pasos/min y ${WALKING_FALLBACK_MET} MET. Bici prioriza watts y luego RPE/rol. Fútbol usa su intensidad disponible. Como los pasos de un partido pueden quedar incluidos también en el contador diario, el total MET-min es una equivalencia práctica de cumplimiento y no una medición exacta de gasto energético.`,
  };
}
