import 'server-only';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { parseSalud } from '@/lib/adapters/salud';
import { getDataSource, getGoogleConfig } from '@/lib/data/config';
import { SALUD_TAB } from '@/lib/google/constants';
import { readTabValues } from '@/lib/google/sheets-read';
import {
  buildHealthIntelligence,
  HEALTH_GYM_UNAVAILABLE,
  HEALTH_NUTRITION_UNAVAILABLE,
} from '@/lib/health/intelligence';
import {
  toDailyPlanningHealth,
  unavailableDailyPlanningHealth,
  type DailyPlanningHealthRead,
} from '@/lib/health/planning-context';
import { periodWindow } from '@/lib/periods';

/**
 * Lee sólo la pestaña sanitaria necesaria y devuelve un DTO derivado mínimo.
 * El caller web ya exige sesión autorizada; esta función nunca usa mocks para
 * producir contexto personal de capacidad.
 */
export async function loadDailyPlanningHealthUncached(
  targetDate: string = todayInBuenosAires(),
): Promise<DailyPlanningHealthRead> {
  if (getDataSource() !== 'google' || !getGoogleConfig().ok) {
    return unavailableDailyPlanningHealth();
  }

  try {
    const result = await readTabValues(SALUD_TAB);
    if (!result.ok) return unavailableDailyPlanningHealth();

    const health = buildHealthPageData({
      records: parseSalud(result.values),
      today: targetDate,
      window: periodWindow(targetDate, 7),
      source: 'google',
      status: 'ready',
      notice: null,
    });
    const intelligence = buildHealthIntelligence({
      health,
      gym: HEALTH_GYM_UNAVAILABLE,
      nutrition: HEALTH_NUTRITION_UNAVAILABLE,
    });
    return toDailyPlanningHealth(intelligence.dailyBrief);
  } catch {
    return unavailableDailyPlanningHealth();
  }
}
