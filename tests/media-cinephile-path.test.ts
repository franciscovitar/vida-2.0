import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCinephilePath,
  cinephileExposure,
  cinephileFoundationXp,
} from '@/lib/media/cinephile-path';
import type { MediaTitleView } from '@/types/media';

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

test('important works contribute materially more than marginal works', () => {
  const high = mediaTitle({
    key: 'movie:high',
    title: 'High',
    cinephileValue: 9.8,
    culturalImpact: 9.6,
  });
  const low = mediaTitle({
    key: 'movie:low',
    title: 'Low',
    cinephileValue: 6.2,
    culturalImpact: 6.1,
  });

  assert.ok(cinephileFoundationXp(high) > cinephileFoundationXp(low) * 5);
});

test('new unwatched catalog titles never reduce current progress', () => {
  const watched = mediaTitle({
    key: 'movie:watched',
    state: 'Vista',
    year: 1972,
    genres: ['Drama', 'Crimen'],
    cinephileValue: 9.4,
    culturalImpact: 9.2,
  });
  const baseline = buildCinephilePath([watched]);
  const expanded = buildCinephilePath([
    watched,
    mediaTitle({ key: 'movie:new-1', title: 'New 1', year: 2026 }),
    mediaTitle({ key: 'series:new-2', medium: 'series', title: 'New 2', year: 2026 }),
  ]);

  assert.equal(expanded.movie.percent, baseline.movie.percent);
  assert.equal(expanded.global.percent, baseline.global.percent);
});

test('personal rating does not alter cultural progress', () => {
  const disliked = mediaTitle({ key: 'movie:seen', state: 'Vista', rating: 2 });
  const loved = mediaTitle({ key: 'movie:seen', state: 'Vista', rating: 10 });

  assert.equal(
    buildCinephilePath([disliked]).movie.percent,
    buildCinephilePath([loved]).movie.percent,
  );
});

test('a bank title that opens an era and genre gets a larger marginal gain', () => {
  const watched = mediaTitle({
    key: 'movie:watched',
    state: 'Vista',
    year: 2015,
    genres: ['Drama'],
    cinephileValue: 8.5,
    culturalImpact: 8.5,
  });
  const sameTerritory = mediaTitle({
    key: 'movie:same',
    title: 'Same territory',
    year: 2016,
    genres: ['Drama'],
    cinephileValue: 8.5,
    culturalImpact: 8.5,
  });
  const opensMap = mediaTitle({
    key: 'movie:opens',
    title: 'Opens map',
    year: 1974,
    genres: ['Documental'],
    cinephileValue: 8.5,
    culturalImpact: 8.5,
  });
  const snapshot = buildCinephilePath([watched, sameTerritory, opensMap]);

  const sameGain = snapshot.gainsByKey.get(sameTerritory.key);
  const opensGain = snapshot.gainsByKey.get(opensMap.key);
  assert.ok(sameGain);
  assert.ok(opensGain);
  assert.ok(opensGain.mediumGain > sameGain.mediumGain);
  assert.match(opensGain.reason, /época|histórico/i);
});

test('rewatches already count as watched and do not create fake future gains', () => {
  const rewatch = mediaTitle({ key: 'movie:rewatch', state: 'Reveer' });
  const snapshot = buildCinephilePath([rewatch]);
  assert.equal(cinephileExposure(rewatch), 1);
  assert.equal(snapshot.gainsByKey.has(rewatch.key), false);
});

test('active series receive partial cultural credit without pretending completion', () => {
  const active = mediaTitle({
    key: 'series:active',
    medium: 'series',
    state: 'Viendo',
    seasons: 4,
    seasonDetails: [
      {
        seasonNumber: 1,
        year: 2020,
        episodeCount: 8,
        observedRating: 8,
        estimatedAffinity: 8,
        cinephileValue: 8.5,
        culturalPresence: 8.5,
        scoreVersion: 'season-intelligence-v1',
        evidenceState: 'ready',
      },
      {
        seasonNumber: 2,
        year: 2021,
        episodeCount: 8,
        observedRating: null,
        estimatedAffinity: 8,
        cinephileValue: 8.5,
        culturalPresence: 8.5,
        scoreVersion: 'season-intelligence-v1',
        evidenceState: 'ready',
      },
      {
        seasonNumber: 3,
        year: 2022,
        episodeCount: 8,
        observedRating: null,
        estimatedAffinity: 8,
        cinephileValue: 8.5,
        culturalPresence: 8.5,
        scoreVersion: 'season-intelligence-v1',
        evidenceState: 'ready',
      },
      {
        seasonNumber: 4,
        year: 2023,
        episodeCount: 8,
        observedRating: null,
        estimatedAffinity: 8,
        cinephileValue: 8.5,
        culturalPresence: 8.5,
        scoreVersion: 'season-intelligence-v1',
        evidenceState: 'ready',
      },
    ],
  });

  assert.equal(cinephileExposure(active), 0.35);
  assert.ok(buildCinephilePath([active]).series.percent > 0);
});
