import 'server-only';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { getDomainPages } from '@/lib/data/domain-pages';
import { buildWeeklyCardioSummary } from '@/lib/gym/cardio-weekly';
import { loadGymCardioSnapshot } from '@/lib/gym/sheets-cardio-port';
import type { GymWeeklyCardioSummary } from '@/types/gym';

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

export async function loadGymWeeklyCardio(
  today: string = todayInBuenosAires(),
): Promise<GymWeeklyCardioSummary> {
  const [cardioResult, pagesResult] = await Promise.allSettled([
    loadGymCardioSnapshot(),
    getDomainPages(7),
  ]);

  const cardio =
    cardioResult.status === 'fulfilled'
      ? cardioResult.value
      : { state: 'error' as const, notice: 'No se pudo leer Cardio Sessions.', sessions: [] };

  const pages = pagesResult.status === 'fulfilled' ? pagesResult.value : null;
  const healthUsable = Boolean(
    pages?.health.sourceAvailable && !(isProductionRuntime() && pages.health.source === 'mock'),
  );

  return buildWeeklyCardioSummary({
    cardioSessions: cardio.sessions,
    healthMetrics: healthUsable ? (pages?.health.metrics ?? []) : [],
    healthPeriodStart: healthUsable ? (pages?.health.periodStart ?? null) : null,
    today,
    cardioSourceAvailable: cardio.state === 'ready' || cardio.state === 'empty',
    healthSourceAvailable: healthUsable,
  });
}
