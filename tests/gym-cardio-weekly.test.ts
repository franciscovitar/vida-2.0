import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildWeeklyCardioSummary,
  WEEKLY_CARDIO_TARGET_MET_MINUTES,
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

test('cardio semanal usa 600 MET-min como cuota equivalente de la fase actual', () => {
  assert.equal(WEEKLY_CARDIO_TARGET_MET_MINUTES, 600);

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
  assert.equal(summary.remainingMetMinutes, 30);
  assert.equal(summary.progressPercent, 95);
  assert.equal(summary.contributions[0]?.met, 5);
  assert.equal(summary.contributions[1]?.met, 7);
});

test('caminata suma solo cuando hay distancia y velocidad moderada compatibles', () => {
  const summary = buildWeeklyCardioSummary({
    cardioSessions: [],
    healthMetrics: [
      metric('steps', [8000]),
      metric('distance', [5]),
      metric('walkingSpeed', [5]),
    ],
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
  assert.equal(summary.uncreditedWalkingDays, 0);
});

test('pasos sin intensidad no se convierten y caminar no se duplica en día de fútbol', () => {
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
    healthMetrics: [
      metric('steps', [12000, 7000]),
      metric('distance', [8, null]),
      metric('walkingSpeed', [5.5, null]),
    ],
    healthPeriodStart: '2026-09-07',
    today: '2026-09-08',
    cardioSourceAvailable: true,
    healthSourceAvailable: true,
  });

  assert.equal(summary.contributions.length, 1);
  assert.equal(summary.contributions[0]?.kind, 'football');
  assert.equal(summary.totalMetMinutes, 420);
  assert.equal(summary.uncreditedWalkingDays, 2);
});
