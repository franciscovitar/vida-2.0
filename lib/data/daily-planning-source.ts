import { cache } from 'react';

import { loadDailyPlanningContextUncached } from '@/lib/daily-planning/context';

/**
 * Fuente factual read-only para futuros consumidores de Daily Planning.
 * Requiere sesión web y no ejecuta ningún write.
 */
export const getDailyPlanningContext = cache(async () => {
  const { requireAuthorizedSession } = await import('@/lib/auth/dal');
  await requireAuthorizedSession();
  return loadDailyPlanningContextUncached();
});
