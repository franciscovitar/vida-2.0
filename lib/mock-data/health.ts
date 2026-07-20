import type { DailyHealth } from '@/types';

/** Métricas de salud y sueño simuladas para hoy. */
export const dailyHealth: DailyHealth = {
  date: '2026-07-20',
  sleepMinutes: 7 * 60 + 40,
  deepSleepMinutes: 1 * 60 + 25,
  restingHeartRate: 54,
  steps: 6820,
  energy: 4,
  trend: {
    sleep: 'up',
    deepSleep: 'steady',
    restingHeartRate: 'down',
    steps: 'down',
  },
};
