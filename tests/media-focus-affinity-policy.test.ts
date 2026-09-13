import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adjustEstimatedAffinity,
  shouldSurfaceEstimatedAffinity,
  watchPriorityScore,
} from '@/lib/media/focus';
import type { MediaTitleView } from '@/types/media';

function movie(overrides: Partial<MediaTitleView> = {}): MediaTitleView {
  return {
    key: 'movie:example:1990',
    medium: 'movie',
    title: 'Example',
    originalTitle: null,
    year: 1990,
    state: 'Por ver',
    bankTier: 'A',
    pool: 'Operativo',
    radar: false,
    rating: null,
    creator: null,
    genres: [],
    countries: [],
    runtimeMinutes: 110,
    seasons: null,
    posterPath: null,
    affinity: null,
    estimatedAffinity: null,
    cinephileValue: 8,
    culturalImpact: 8,
    generalScore: null,
    manualFocusLevel: null,
    manualFocusExcluded: false,
    ageFeelScore: 4.3,
    ageFeelLabel: 'Se siente ligeramente de época',
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
    ...overrides,
  };
}

test('una película candidata a lote puede usar Personal Fit provisional aunque quede bajo el umbral histórico', () => {
  assert.equal(shouldSurfaceEstimatedAffinity(movie(), false), true);
});

test('el umbral histórico sigue mandando fuera del foco y para series', () => {
  assert.equal(
    shouldSurfaceEstimatedAffinity(movie({ bankTier: 'C', pool: 'Reserva' }), false),
    false,
  );
  assert.equal(
    shouldSurfaceEstimatedAffinity(
      movie({ medium: 'series', bankTier: null, pool: null, seasons: 1, runtimeMinutes: 45 }),
      false,
    ),
    false,
  );
  assert.equal(
    shouldSurfaceEstimatedAffinity(movie({ bankTier: 'C', pool: 'Reserva' }), true),
    true,
  );
});

test('una película que se siente más de época baja afinidad y también Prioridad de visionado', () => {
  const basePersonalFit = 8.2;
  const currentAffinity = adjustEstimatedAffinity('movie', 1, basePersonalFit);
  const oldAffinity = adjustEstimatedAffinity('movie', 8, basePersonalFit);

  assert.ok(currentAffinity !== null && oldAffinity !== null);
  assert.ok(oldAffinity < currentAffinity);

  const currentPriority = watchPriorityScore(movie({ estimatedAffinity: currentAffinity }));
  const oldPriority = watchPriorityScore(movie({ estimatedAffinity: oldAffinity }));

  assert.ok(currentPriority !== null && oldPriority !== null);
  assert.ok(oldPriority < currentPriority);
});
