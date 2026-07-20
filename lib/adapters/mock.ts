/**
 * Construye `TodayData` a partir de los datos simulados.
 *
 * Reproduce exactamente la salida aprobada en la Fase 1 (mismos textos, estados
 * y formatos), de modo que `DATA_SOURCE=mock` no cambie nada visualmente.
 */
import type { HabitView, TodayData } from '@/types';

import { formatDuration, formatFullDate, formatNumber, minutesToHours } from '../format';
import {
  dailyHealth,
  habits,
  productivity,
  referenceDate,
  syncState,
  weeklyGoals,
} from '../mock-data';
import { capitalize, deltaFromMinutes, greetingForHour } from './views';

export function buildMockToday(): TodayData {
  const doneHabits = habits.filter((habit) => habit.status === 'done').length;
  const totalHabits = habits.length;
  const work = productivity.buckets.find((bucket) => bucket.id === 'work');
  const university = productivity.buckets.find((bucket) => bucket.id === 'university');

  const habitViews: HabitView[] = habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    icon: habit.icon,
    status: habit.status,
    streak: habit.streak,
    streakAvailable: habit.status !== 'unavailable',
  }));

  const maxMinutes = Math.max(...productivity.buckets.map((bucket) => bucket.minutes), 1);

  const syncedTime = new Date(syncState.lastSyncedAt).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const syncOk = syncState.sources.every((source) => source.ok);

  return {
    source: 'mock',
    status: 'mock',
    notice: null,
    targetDate: '2026-07-20',
    registroDate: '2026-07-20',
    healthDate: '2026-07-20',
    header: {
      fullDate: capitalize(formatFullDate(referenceDate)),
      greeting: greetingForHour(referenceDate.getHours()),
      syncOk,
      syncLabel: syncOk ? `Sincronizado ${syncedTime}` : 'Sincronización parcial',
    },
    summary: {
      habits: {
        value: `${doneHabits}/${totalHabits}`,
        context: 'completados hoy',
        status: doneHabits >= totalHabits - 1 ? 'good' : 'warning',
      },
      sleep: {
        value: String(minutesToHours(dailyHealth.sleepMinutes)),
        unit: 'h',
        context: 'por encima del objetivo',
        status: 'good',
        trend: dailyHealth.trend.sleep,
      },
      work: {
        value: formatDuration(work?.minutes ?? 0),
        context: 'registrado hoy',
        status: 'neutral',
      },
      faculty: {
        value: formatDuration(university?.minutes ?? 0),
        context: 'registrado hoy',
        status: 'neutral',
      },
      energy: {
        value: `${dailyHealth.energy}/5`,
        context: 'autoevaluación',
        status: dailyHealth.energy >= 4 ? 'good' : 'warning',
      },
    },
    health: {
      sleep: {
        value: formatDuration(dailyHealth.sleepMinutes),
        context: 'mejor que ayer',
        status: 'good',
        trend: dailyHealth.trend.sleep,
      },
      deepSleep: {
        value: formatDuration(dailyHealth.deepSleepMinutes),
        context: 'estable',
        status: 'neutral',
        trend: dailyHealth.trend.deepSleep,
      },
      restingHeartRate: {
        value: String(dailyHealth.restingHeartRate),
        unit: 'ppm',
        context: 'más baja que ayer',
        status: 'good',
        trend: dailyHealth.trend.restingHeartRate,
      },
      steps: {
        value: formatNumber(dailyHealth.steps),
        context: 'por debajo de ayer',
        status: 'warning',
        trend: dailyHealth.trend.steps,
      },
    },
    productivity: {
      active: {
        value: formatDuration(productivity.activeMinutes),
        delta: deltaFromMinutes(productivity.activeMinutes, productivity.previousActiveMinutes),
      },
      maxMinutes,
      rows: productivity.buckets.map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        domain: bucket.domain,
        value: formatDuration(bucket.minutes),
        fillMinutes: bucket.minutes,
        delta: deltaFromMinutes(bucket.minutes, bucket.previousMinutes),
      })),
    },
    habits: habitViews,
    weekly: weeklyGoals,
  };
}
