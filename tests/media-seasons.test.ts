import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isFocusCandidate, watchPriorityScore } from '@/lib/media/focus';
import {
  buildSeasonSkeleton,
  deriveNextSeasonNumber,
  parseObservedSeasonRatings,
  seasonWatchPriorityScore,
} from '@/lib/media/seasons';
import { filterMediaTitles, sortMediaTitles } from '@/lib/media/view';
import type { MediaFilters, MediaSeasonView, MediaTitleView } from '@/types/media';

function season(seasonNumber: number, overrides: Partial<MediaSeasonView> = {}): MediaSeasonView {
  return {
    seasonNumber,
    year: null,
    episodeCount: null,
    observedRating: null,
    estimatedAffinity: null,
    cinephileValue: null,
    culturalPresence: null,
    scoreVersion: null,
    evidenceState: 'unavailable',
    ...overrides,
  };
}

function series(overrides: Partial<MediaTitleView> = {}): MediaTitleView {
  return {
    key: 'series:example:2020',
    medium: 'series',
    title: 'Example',
    originalTitle: null,
    year: 2020,
    state: 'Por ver',
    bankTier: null,
    pool: 'Banco',
    radar: false,
    rating: null,
    creator: null,
    genres: ['Drama'],
    countries: ['Argentina'],
    runtimeMinutes: 50,
    seasons: 5,
    seasonDetails: [],
    nextSeasonNumber: 1,
    posterPath: null,
    affinity: null,
    estimatedAffinity: 8,
    cinephileValue: 8,
    culturalImpact: 8,
    generalScore: null,
    manualFocusLevel: null,
    manualFocusExcluded: false,
    ageFeelScore: null,
    ageFeelLabel: null,
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
    ...overrides,
  };
}

function bankFilters(): MediaFilters {
  return {
    medium: 'series',
    collection: 'bank',
    query: '',
    genre: '',
    country: '',
    creator: '',
    yearFrom: '',
    yearTo: '',
    commitment: 'all',
    sort: 'focus-priority',
  };
}

test('Notas por temporada conserva el número explícito y la nota observada', () => {
  const ratings = parseObservedSeasonRatings('T1 8.5 / T2 7,75 / T4 9');
  assert.deepEqual(
    [...ratings.entries()],
    [
      [1, 8.5],
      [2, 7.75],
      [4, 9],
    ],
  );
});

test('una serie Por ver empieza por temporada 1 sin inventar historial', () => {
  assert.equal(deriveNextSeasonNumber('Por ver', 7, new Map()), 1);
});

test('una serie Viendo avanza a la temporada posterior a la última puntuada', () => {
  const observed = new Map([
    [1, 8.5],
    [2, 8],
    [3, 7.5],
  ]);
  assert.equal(deriveNextSeasonNumber('Viendo', 7, observed), 4);
});

test('un estado terminal no reaparece como pendiente aunque falten notas históricas', () => {
  const observed = new Map([[1, 8.5]]);
  assert.equal(deriveNextSeasonNumber('Terminada', 5, observed), null);
  assert.equal(deriveNextSeasonNumber('Abandonada', 5, observed), null);
  assert.equal(deriveNextSeasonNumber('Al día', 5, observed), null);
});

test('el esqueleto de temporadas preserva Mi nota y deja señales derivadas desconocidas en null', () => {
  const details = buildSeasonSkeleton(
    4,
    new Map([
      [1, 9],
      [2, 7.75],
    ]),
  );
  assert.equal(details.length, 4);
  assert.equal(details[0]?.observedRating, 9);
  assert.equal(details[1]?.observedRating, 7.75);
  assert.equal(details[2]?.observedRating, null);
  assert.equal(details[3]?.estimatedAffinity, null);
  assert.equal(details[3]?.cinephileValue, null);
  assert.equal(details[3]?.culturalPresence, null);
  assert.equal(details[3]?.evidenceState, 'unavailable');
});

test('una serie Viendo con siguiente temporada conocida sigue siendo accionable y aparece en Banco', () => {
  const item = series({
    state: 'Viendo',
    nextSeasonNumber: 4,
    seasonDetails: [season(4)],
  });
  assert.equal(isFocusCandidate(item, 'series'), true);
  assert.deepEqual(
    filterMediaTitles([item], bankFilters()).map((candidate) => candidate.key),
    [item.key],
  );
});

test('ordenar la serie completa y ordenar la próxima temporada son decisiones independientes', () => {
  const overallFirst = series({
    key: 'series:overall-first:2020',
    title: 'Overall first',
    estimatedAffinity: 9.5,
    cinephileValue: 9.4,
    culturalImpact: 9.3,
    nextSeasonNumber: 2,
    seasonDetails: [
      season(2, {
        estimatedAffinity: 6.5,
        cinephileValue: 6.4,
        culturalPresence: 6.3,
        evidenceState: 'ready',
      }),
    ],
  });
  const nextSeasonFirst = series({
    key: 'series:next-first:2020',
    title: 'Next first',
    estimatedAffinity: 8.2,
    cinephileValue: 8.1,
    culturalImpact: 8,
    nextSeasonNumber: 3,
    seasonDetails: [
      season(3, {
        estimatedAffinity: 9.7,
        cinephileValue: 9.5,
        culturalPresence: 9.6,
        evidenceState: 'ready',
      }),
    ],
  });

  assert.deepEqual(
    sortMediaTitles([nextSeasonFirst, overallFirst], 'focus-priority').map((item) => item.key),
    [overallFirst.key, nextSeasonFirst.key],
  );
  assert.deepEqual(
    sortMediaTitles([overallFirst, nextSeasonFirst], 'next-season-priority-desc').map(
      (item) => item.key,
    ),
    [nextSeasonFirst.key, overallFirst.key],
  );
});

test('las notas generales de una serie no se recalculan como promedio de temporadas', () => {
  const item = series({
    estimatedAffinity: 9,
    cinephileValue: 8.5,
    culturalImpact: 8,
    seasonDetails: [
      season(1, {
        estimatedAffinity: 2,
        cinephileValue: 3,
        culturalPresence: 4,
        evidenceState: 'ready',
      }),
      season(2, {
        estimatedAffinity: 4,
        cinephileValue: 5,
        culturalPresence: 6,
        evidenceState: 'ready',
      }),
    ],
  });
  assert.equal(watchPriorityScore(item), 9 * 0.5 + 8.5 * 0.3 + 8 * 0.2);
});

test('una temporada sin evidencia no recibe Prioridad cero ni una nota inventada', () => {
  assert.equal(seasonWatchPriorityScore(season(1)), null);
});
