import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildWeeklyCardioSummary,
  DAILY_STEPS_TARGET,
  WEEKLY_BIKE_TARGET_MINUTES,
  WEEKLY_CARDIO_TARGET_MET_MINUTES,
  WEEKLY_FOOTBALL_TARGET_MATCHES,
  WEEKLY_STEPS_TARGET,
} from '@/lib/gym/cardio-weekly';
import type { GymCardioSession } from '@/types/gym';

function session(overrides: Partial<GymCardioSession>): GymCardioSession {
  return {
    key: 'cardio-test',
    date: '2026-09-09',
    activityType: 'zone2',
    modality: 'bicicleta fija',
    durationMinutes: 30,
    distanceKm: null,
    averageSpeed: null,
    averagePowerWatts: null,
    averageHeartRate: null,
    maxHeartRate: null,
    rpe: null,
    note: null,
    ...overrides,
  };
}

function metric(id: string, series: (number | null)[]) {
  return { id, series };
}

test('cardio semanal deriva la cuota del plan real 8k pasos/día + 120 min bici + 1 fútbol', () => {
  assert.equal(DAILY_STEPS_TARGET, 8000);
  assert.equal(WEEKLY_STEPS_TARGET, 56000);
  assert.equal(WEEKLY_BIKE_TARGET_MINUTES, 120);
  assert.equal(WEEKLY_FOOTBALL_TARGET_MATCHES, 1);
  assert.equal(WEEKLY_CARDIO_TARGET_MET_MINUTES, 2980);

  const summary = buildWeeklyCardioSummary({
    cardioSessions: [
      session({ averagePowerWatts: 60, durationMinutes: 30 }),
      session({
        key: 'football',
        date: '2026-09-10',
        activityType: 'football',
        modality: 'fútbol',
        durationMinutes: 60,
      }),
    ],
    healthMetrics: [],
    healthPeriodStart: null,
    today: '2026-09-10',
    cardioSourceAvailable: true,
    healthSourceAvailable: false,
  });

  assert.equal(summary.totalMetMinutes, 570);
  assert.equal(summary.remainingMetMinutes, 2410);
  assert.equal(summary.progressPercent, 19);
  assert.equal(summary.weeklyBikeMinutes, 30);
  assert.equal(summary.remainingBikeMinutes, 90);
  assert.equal(summary.weeklyFootballMatches, 1);
  assert.equal(summary.remainingFootballMatches, 0);
  assert.equal(summary.contributions[0]?.met, 5);
  assert.equal(summary.contributions[1]?.met, 7);
});

test('caminata usa distancia y velocidad cuando existen y conserva los pasos del día', () => {
  const summary = buildWeeklyCardioSummary({
    cardioSessions: [],
    healthMetrics: [metric('steps', [8000]), metric('distance', [5]), metric('walkingSpeed', [5])],
    healthPeriodStart: '2026-09-07',
    today: '2026-09-07',
    cardioSourceAvailable: true,
    healthSourceAvailable: true,
  });

  assert.equal(summary.contributions.length, 1);
  assert.equal(summary.contributions[0]?.kind, 'walking');
  assert.equal(summary.contributions[0]?.durationMinutes, 60);
  assert.equal(summary.contributions[0]?.met, 3.8);
  assert.equal(summary.contributions[0]?.metMinutes, 228);
  assert.equal(summary.weeklySteps, 8000);
  assert.equal(summary.remainingSteps, 48000);
  assert.equal(summary.estimatedWalkingDays, 0);
});

test('pasos sin intensidad siempre suman con proxy promedio conservador', () => {
  const summary = buildWeeklyCardioSummary({
    cardioSessions: [],
    healthMetrics: [metric('steps', [8000])],
    healthPeriodStart: '2026-09-07',
    today: '2026-09-07',
    cardioSourceAvailable: true,
    healthSourceAvailable: true,
  });

  assert.equal(summary.contributions.length, 1);
  assert.equal(summary.contributions[0]?.kind, 'walking');
  assert.equal(summary.contributions[0]?.durationMinutes, 80);
  assert.equal(summary.contributions[0]?.met, 3.5);
  assert.equal(summary.contributions[0]?.metMinutes, 280);
  assert.equal(summary.totalMetMinutes, 280);
  assert.equal(summary.weeklySteps, 8000);
  assert.equal(summary.estimatedWalkingDays, 1);
});

test('pasos también suman en día de fútbol porque forman parte explícita del plan diario', () => {
  const summary = buildWeeklyCardioSummary({
    cardioSessions: [
      session({
        key: 'football',
        date: '2026-09-07',
        activityType: 'football',
        modality: 'fútbol',
        durationMinutes: 60,
      }),
    ],
    healthMetrics: [metric('steps', [12000, 7000])],
    healthPeriodStart: '2026-09-07',
    today: '2026-09-08',
    cardioSourceAvailable: true,
    healthSourceAvailable: true,
  });

  assert.equal(summary.contributions.length, 3);
  assert.equal(summary.totalMetMinutes, 1085);
  assert.equal(summary.weeklySteps, 19000);
  assert.equal(summary.weeklyFootballMatches, 1);
  assert.equal(summary.estimatedWalkingDays, 2);
});

test('muestra equivalencias de lo que falta sin reemplazar los objetivos directos', () => {
  const summary = buildWeeklyCardioSummary({
    cardioSessions: [],
    healthMetrics: [],
    healthPeriodStart: null,
    today: '2026-09-10',
    cardioSourceAvailable: true,
    healthSourceAvailable: true,
  });

  assert.equal(summary.remainingMetMinutes, 2980);
  assert.equal(summary.remainingEquivalentSteps, 85100);
  assert.equal(summary.remainingEquivalentBikeMinutes, 596);
  assert.equal(summary.remainingEquivalentFootballMatches, 7.1);
  assert.equal(summary.remainingSteps, 56000);
  assert.equal(summary.remainingBikeMinutes, 120);
  assert.equal(summary.remainingFootballMatches, 1);
});
