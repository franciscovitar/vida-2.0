import 'server-only';

import { cache } from 'react';

import { getDomainPages } from '@/lib/data/domain-pages';
import { getHealthContextInputs } from '@/lib/health/context-sources';
import { buildPersonalDeviationRadar } from '@/lib/health/deviation-radar';
import { buildHealthIntelligence } from '@/lib/health/intelligence';
import {
  buildRhythmFeaturesViewModel,
  loadRhythmFeaturesSnapshot,
} from '@/lib/health/rhythm-features-sheet';
import type { PeriodDays } from '@/lib/periods';

export const loadHealthPageModel = cache(async (periodDays: PeriodDays) => {
  const [data, context, rhythmSnapshot] = await Promise.all([
    getDomainPages(periodDays),
    getHealthContextInputs(),
    loadRhythmFeaturesSnapshot(),
  ]);

  const health = data.health;
  const rhythm = buildRhythmFeaturesViewModel(rhythmSnapshot);
  const deviationRadar = buildPersonalDeviationRadar(health);
  const intelligence = buildHealthIntelligence({
    health,
    gym: context.gym,
    nutrition: context.nutrition,
    rhythm: rhythm.result,
  });

  return {
    health,
    rhythm,
    deviationRadar,
    intelligence,
  };
});
