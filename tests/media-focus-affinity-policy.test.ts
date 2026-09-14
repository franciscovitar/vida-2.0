import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adjustEstimatedAffinity,
  shouldSurfaceEstimatedAffinity,
  watchPriorityScore,
} from '@/lib/media/focus';
import type { MediaTitleView } from '@/types/media';

function title(overrides: Partial<MediaTitleView> = {}): MediaTitleView {
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
    seasonDetails: [],
    nextSeasonNumber: null,
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

test('una película no vista muestra Personal Fit aunque esté fuera de los lotes', () => {
  assert.equal(shouldSurfaceEstimatedAffinity(title({ bankTier: 'C', pool: 'Reserva' })), true);
});

test('una serie muestra Personal Fit también fuera de los lotes y aunque esté terminada', () => {
  assert.equal(
    shouldSurfaceEstimatedAffinity(
      title({
        key: 'series:example:2020',
        medium: 'series',
        state: 'Terminada',
        bankTier: null,
        pool: null,
        seasons: 3,
        runtimeMinutes: 45,
      }),
    ),
    true,
  );
});

test('una película ya vista no muestra Personal Fit', () => {
  assert.equal(shouldSurfaceEstimatedAffinity(title({ state: 'Vista' })), false);
});

test('una película marcada Reveer tampoco muestra Personal Fit porque ya fue vista', () => {
  assert.equal(shouldSurfaceEstimatedAffinity(title({ state: 'Reveer' })), false);
});

test('una serie activa con próxima temporada conocida mantiene visible su afinidad', () => {
  assert.equal(
    shouldSurfaceEstimatedAffinity(
      title({
        key: 'series:active:2020',
        medium: 'series',
        state: 'Viendo',
        bankTier: null,
        pool: null,
        seasons: 5,
        nextSeasonNumber: 3,
        runtimeMinutes: 45,
      }),
    ),
    true,
  );
});

test('una película que se siente más de época baja afinidad y también Prioridad de visionado', () => {
  const basePersonalFit = 8.2;
  const currentAffinity = adjustEstimatedAffinity('movie', 1, basePersonalFit);
  const oldAffinity = adjustEstimatedAffinity('movie', 8, basePersonalFit);

  assert.ok(currentAffinity !== null && oldAffinity !== null);
  assert.ok(oldAffinity < currentAffinity);

  const currentPriority = watchPriorityScore(title({ estimatedAffinity: currentAffinity }));
  const oldPriority = watchPriorityScore(title({ estimatedAffinity: oldAffinity }));

  assert.ok(currentPriority !== null && oldPriority !== null);
  assert.ok(oldPriority < currentPriority);
});
