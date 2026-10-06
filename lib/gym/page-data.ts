import 'server-only';

import { cache } from 'react';

import { loadGymWeeklyCardio } from '@/lib/gym/cardio-dashboard';
import { loadGymDashboard } from '@/lib/gym/load';
import type { GymDashboardData } from '@/types/gym';

export const loadGymPageData = cache(async (): Promise<GymDashboardData> => {
  const base = await loadGymDashboard();
  const weeklyCardio = await loadGymWeeklyCardio(base.targetDate);
  return { ...base, weeklyCardio };
});
