import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mediaPublicKey } from '@/lib/media/key';
import {
  parseSeasonIntelligence,
  withSeasonIntelligence,
  withoutVerifiedLegacySeasonRows,
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
    key: mediaPublicKey('series', 'Example', 2020),
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

  assert.equal(second.estimatedAffinity, null);
  assert.equal(second.cinephileValue, null);
  assert.equal(second.culturalPresence, null);
  assert.equal(second.evidenceState, 'partial');
});

test('una temporada sin ajuste específico no hereda la afinidad de la serie', () => {
  const parsed = parseSeasonIntelligence([
    [...HEADERS],
    ['Example', 2020, 2, 2021, 10, 8.5, 8.2, '', 'external-scoring-v1.2', 'partial'],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const enriched = withSeasonIntelligence([baseSeries()], parsed.bySeries)[0]!;
  const second = enriched.seasonDetails.find((season) => season.seasonNumber === 2)!;

  assert.equal(second.estimatedAffinity, null);
  assert.equal(second.cinephileValue, 8.5);
  assert.equal(second.culturalPresence, 8.2);
});

test('una fila legacy de temporada se oculta sólo con evidencia canónica coincidente', () => {
  const parsed = parseSeasonIntelligence([
    [...HEADERS],
    ['Wednesday', 2022, 2, 2025, '', 8.3, 9.8, '', 'external-scoring-v1.1', 'ready'],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const canonical: MediaTitleView = {
    ...baseSeries(),
    key: mediaPublicKey('series', 'Wednesday', 2022),
    title: 'Wednesday',
    year: 2022,
    state: 'Terminada',
    seasons: 2,
    nextSeasonNumber: null,
  };
  const legacySeason: MediaTitleView = {
    ...baseSeries(),
    key: mediaPublicKey('series', 'Wednesday 2', 2025),
    title: 'Wednesday 2',
    year: 2025,
    state: 'Terminada',
    seasons: 1,
    rating: 7.75,
    cinephileValue: 8.3,
    culturalImpact: 9.8,
    scoreVersion: 'external-scoring-v1.1',
    nextSeasonNumber: null,
  };

  assert.deepEqual(
    withoutVerifiedLegacySeasonRows([canonical, legacySeason], parsed.bySeries).map(
      (item) => item.key,
    ),
    [canonical.key],
  );
});

test('una serie numerada real no se oculta si los scores no prueban el vínculo de temporada', () => {
  const parsed = parseSeasonIntelligence([
    [...HEADERS],
    ['Example', 2020, 2, 2021, '', 8.3, 9.8, '', 'external-scoring-v1.1', 'ready'],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const canonical: MediaTitleView = {
    ...baseSeries(),
    key: mediaPublicKey('series', 'Example', 2020),
    title: 'Example',
    year: 2020,
  };
  const numberedTitle: MediaTitleView = {
    ...baseSeries(),
    key: mediaPublicKey('series', 'Example 2', 2021),
    title: 'Example 2',
    year: 2021,
    seasons: 1,
    cinephileValue: 7.1,
    culturalImpact: 9.8,
    scoreVersion: 'external-scoring-v1.1',
  };

  assert.equal(
    withoutVerifiedLegacySeasonRows([canonical, numberedTitle], parsed.bySeries).length,
    2,
  );
});
