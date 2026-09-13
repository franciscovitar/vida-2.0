import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseSeasonIntelligence,
  withSeasonIntelligence,
} from '@/lib/media/season-intelligence';
import type { MediaTitleView } from '@/types/media';

const HEADERS = [
  'Título serie',
  'Año serie',
  'Temporada',
  'Año temporada',
  'Episodios',
  'Valor cinéfilo',
  'Presencia cultural',
  'Ajuste afinidad',
  'Score versión',
  'Estado evidencia',
] as const;

function baseSeries(): MediaTitleView {
  return {
    key: 'series:example:2020',
    medium: 'series',
    title: 'Example',
    originalTitle: null,
    year: 2020,
    state: 'Viendo',
    bankTier: null,
    pool: 'Banco',
    radar: false,
    rating: null,
    creator: null,
    genres: ['Drama'],
    countries: ['Argentina'],
    runtimeMinutes: 50,
    seasons: 3,
    seasonDetails: [
      {
        seasonNumber: 2,
        year: null,
        episodeCount: null,
        observedRating: 7.75,
        estimatedAffinity: null,
        cinephileValue: null,
        culturalPresence: null,
        scoreVersion: null,
        evidenceState: 'unavailable',
      },
    ],
    nextSeasonNumber: 2,
    posterPath: null,
    affinity: null,
    estimatedAffinity: 8.4,
    cinephileValue: 8.1,
    culturalImpact: 7.9,
    generalScore: null,
    manualFocusLevel: null,
    manualFocusExcluded: false,
    ageFeelScore: null,
    ageFeelLabel: null,
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
  };
}

test('Series Seasons falla cerrado si falta un header canónico', () => {
  const parsed = parseSeasonIntelligence([HEADERS.filter((header) => header !== 'Temporada')]);
  assert.deepEqual(parsed, { ok: false, missing: ['Temporada'] });
});

test('Series Seasons conserva Mi nota y agrega sólo señales derivadas de temporada', () => {
  const parsed = parseSeasonIntelligence([
    [...HEADERS],
    ['Example', 2020, 2, 2021, 10, 8.73, 9.12, 0.35, 'external-scoring-v1.2', 'ready'],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const enriched = withSeasonIntelligence([baseSeries()], parsed.bySeries)[0]!;
  const second = enriched.seasonDetails.find((season) => season.seasonNumber === 2)!;

  assert.equal(second.observedRating, 7.75);
  assert.equal(second.year, 2021);
  assert.equal(second.episodeCount, 10);
  assert.equal(second.estimatedAffinity, 8.75);
  assert.equal(second.cinephileValue, 8.73);
  assert.equal(second.culturalPresence, 9.12);
  assert.equal(second.scoreVersion, 'external-scoring-v1.2');
  assert.equal(second.evidenceState, 'ready');
});

test('scores o ajustes fuera de rango no se transforman en evidencia válida', () => {
  const parsed = parseSeasonIntelligence([
    [...HEADERS],
    ['Example', 2020, 2, 2021, 10, 11, -1, 4, 'external-scoring-v1.2', 'partial'],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const enriched = withSeasonIntelligence([baseSeries()], parsed.bySeries)[0]!;
  const second = enriched.seasonDetails.find((season) => season.seasonNumber === 2)!;

  assert.equal(second.estimatedAffinity, 8.4);
  assert.equal(second.cinephileValue, null);
  assert.equal(second.culturalPresence, null);
  assert.equal(second.evidenceState, 'partial');
});
