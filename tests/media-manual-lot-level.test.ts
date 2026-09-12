import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveFocusTitles } from '@/lib/media/focus';
import type { MediaFocusLevel, MediaTitleView } from '@/types/media';

function movie(
  key: string,
  estimatedAffinity: number,
  manualFocusLevel: MediaFocusLevel | null = null,
): MediaTitleView {
  return {
    key,
    medium: 'movie',
    title: key,
    originalTitle: null,
    year: 2020,
    state: 'Por ver',
    bankTier: 'A',
    pool: 'Operativo',
    radar: false,
    rating: null,
    creator: null,
    genres: ['Drama'],
    countries: ['Argentina'],
    runtimeMinutes: 100,
    seasons: null,
    posterPath: null,
    affinity: null,
    estimatedAffinity,
    cinephileValue: estimatedAffinity,
    culturalImpact: estimatedAffinity,
    generalScore: null,
    manualFocusLevel,
    manualFocusExcluded: false,
    ageFeelScore: 1,
    ageFeelLabel: 'Se siente muy actual',
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
  };
}

test('un override manual no aparece antes del lote exacto elegido aunque su score sea máximo', () => {
  const automatic = Array.from({ length: 110 }, (_, index) =>
    movie(`auto-${index + 1}`, 9 - index / 100),
  );
  const forcedTwo = movie('forced-two', 10, 2);
  const forcedThree = movie('forced-three', 10, 3);
  const titles = [...automatic, forcedTwo, forcedThree];

  const lot1 = deriveFocusTitles(titles, 'movie', 1).map((item) => item.key);
  const lot2 = deriveFocusTitles(titles, 'movie', 2).map((item) => item.key);
  const lot3 = deriveFocusTitles(titles, 'movie', 3).map((item) => item.key);

  assert.equal(lot1.includes('forced-two'), false);
  assert.equal(lot1.includes('forced-three'), false);
  assert.equal(lot2.includes('forced-two'), true);
  assert.equal(lot2.includes('forced-three'), false);
  assert.equal(lot3.includes('forced-two'), true);
  assert.equal(lot3.includes('forced-three'), true);
});
