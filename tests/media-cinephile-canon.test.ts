import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cinephileObligationFor,
  externalCanonEntries,
  externalCanonEntryFor,
} from '@/lib/media/cinephile-canon';
import { buildCinephilePath } from '@/lib/media/cinephile-path';
import { filterMediaTitles } from '@/lib/media/view';
import type { MediaFilters, MediaTitleView } from '@/types/media';

function mediaTitle(overrides: Partial<MediaTitleView> = {}): MediaTitleView {
  return {
    key: overrides.key ?? 'movie:base',
    medium: overrides.medium ?? 'movie',
    title: overrides.title ?? 'Base',
    originalTitle: overrides.originalTitle ?? null,
    year: overrides.year ?? 2015,
    state: overrides.state ?? 'Por ver',
    bankTier: overrides.bankTier ?? 'A',
    pool: overrides.pool ?? null,
    radar: overrides.radar ?? false,
    rating: overrides.rating ?? null,
    observedDate: overrides.observedDate ?? null,
    personalOpinion: overrides.personalOpinion ?? null,
    creator: overrides.creator ?? null,
    genres: overrides.genres ?? ['Drama'],
    countries: overrides.countries ?? [],
    runtimeMinutes: overrides.runtimeMinutes ?? 110,
    seasons: overrides.seasons ?? null,
    seasonDetails: overrides.seasonDetails ?? [],
    nextSeasonNumber: overrides.nextSeasonNumber ?? null,
    posterPath: overrides.posterPath ?? null,
    affinity: overrides.affinity ?? null,
    estimatedAffinity: overrides.estimatedAffinity ?? null,
    cinephileValue: overrides.cinephileValue ?? 8,
    culturalImpact: overrides.culturalImpact ?? 8,
    generalScore: overrides.generalScore ?? null,
    scoreVersion: overrides.scoreVersion ?? 'external-scoring-v1.1',
    manualFocusLevel: overrides.manualFocusLevel ?? null,
    manualFocusExcluded: overrides.manualFocusExcluded ?? false,
    ageFeelScore: overrides.ageFeelScore ?? null,
    ageFeelLabel: overrides.ageFeelLabel ?? null,
    whyForMe: overrides.whyForMe ?? null,
    spoilerFreeSummary: overrides.spoilerFreeSummary ?? null,
    whatToExpect: overrides.whatToExpect ?? null,
    experienceConfidence: overrides.experienceConfidence ?? null,
  };
}

function filters(patch: Partial<MediaFilters> = {}): MediaFilters {
  return {
    medium: 'movie',
    collection: 'all',
    query: '',
    genre: '',
    country: '',
    creator: '',
    yearFrom: '',
    yearTo: '',
    commitment: 'all',
    obligation: 'all',
    sort: 'bank-priority',
    ...patch,
  };
}

test('external canon assigns demanding movie obligation tiers', () => {
  assert.equal(cinephileObligationFor(mediaTitle({ title: 'Citizen Kane' })), 'imprescindible');
  assert.equal(cinephileObligationFor(mediaTitle({ title: 'Mulholland Drive' })), 'esencial');
  assert.equal(cinephileObligationFor(mediaTitle({ title: 'Spirited Away' })), 'muy-recomendable');
  assert.equal(cinephileObligationFor(mediaTitle({ title: 'Parasite' })), 'recomendable');
});

test('highest obligation tiers require external canon evidence', () => {
  const acclaimedButUnlisted = mediaTitle({
    title: 'Recent Acclaimed Work',
    cinephileValue: 9.8,
    culturalImpact: 9.7,
  });
  assert.equal(cinephileObligationFor(acclaimedButUnlisted), 'muy-recomendable');
});

test('The Wire remains imprescindible even if it is absent from the user bank', () => {
  const wire = mediaTitle({ medium: 'series', key: 'series:wire', title: 'The Wire', year: 2002 });
  assert.equal(externalCanonEntryFor(wire)?.obligation, 'imprescindible');
  assert.equal(cinephileObligationFor(wire), 'imprescindible');
});

test('a missing external imprescindible keeps the final milestone open and appears as an off-Media gap', () => {
  const wireEntry = externalCanonEntries('series').find((entry) => entry.title === 'The Wire');
  assert.ok(wireEntry);

  const otherCoreSeen = externalCanonEntries('series')
    .filter((entry) => entry.obligation === 'imprescindible' && entry.id !== wireEntry.id)
    .map((entry, index) =>
      mediaTitle({
        key: `series:core:${index}`,
        medium: 'series',
        title: entry.title,
        year: entry.year ?? null,
        state: 'Terminada',
        seasons: 1,
        genres: ['Drama'],
        cinephileValue: 9,
        culturalImpact: 9,
      }),
    );

  const missing = buildCinephilePath(otherCoreSeen);
  assert.equal(missing.series.coreCovered, missing.series.coreTotal - 1);
  assert.ok(missing.series.percent <= 99.4);
  assert.ok(
    missing.recommendations.series.some(
      (item) =>
        item.title === 'The Wire' && item.inMedia === false && item.obligation === 'imprescindible',
    ),
  );

  const withWire = buildCinephilePath([
    ...otherCoreSeen,
    mediaTitle({
      key: 'series:wire:seen',
      medium: 'series',
      title: 'The Wire',
      year: 2002,
      state: 'Terminada',
      seasons: 5,
      genres: ['Drama', 'Crimen'],
      cinephileValue: 9.8,
      culturalImpact: 9.7,
    }),
  ]);
  assert.equal(withWire.series.coreCovered, withWire.series.coreTotal);
  assert.ok(withWire.series.percent > missing.series.percent);
  assert.equal(
    withWire.recommendations.series.some((item) => item.title === 'The Wire'),
    false,
  );
});

test('obligation filter works independently from bank membership', () => {
  const titles = [
    mediaTitle({ key: 'movie:kane', title: 'Citizen Kane', state: 'Vista' }),
    mediaTitle({ key: 'movie:parasite', title: 'Parasite', state: 'Vista' }),
    mediaTitle({
      key: 'movie:optional',
      title: 'Small Personal Film',
      state: 'Vista',
      cinephileValue: 6,
    }),
  ];

  const indispensable = filterMediaTitles(
    titles,
    filters({ collection: 'seen', obligation: 'imprescindible' }),
  );
  assert.deepEqual(
    indispensable.map((item) => item.title),
    ['Citizen Kane'],
  );

  const recommended = filterMediaTitles(
    titles,
    filters({ collection: 'seen', obligation: 'recomendable' }),
  );
  assert.deepEqual(
    recommended.map((item) => item.title),
    ['Parasite'],
  );
});
