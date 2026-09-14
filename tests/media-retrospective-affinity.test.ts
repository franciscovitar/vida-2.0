import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mediaPublicKey } from '@/lib/media/key';
import {
  parseRetrospectiveSeriesAffinity,
  withRetrospectiveSeriesAffinity,
} from '@/lib/media/retrospective-affinity';
import type { MediaTitleView } from '@/types/media';

const HEADERS = [
  'Media ID',
  'Título serie',
  'Año serie',
  'Estado al generar',
  'Afinidad retrospectiva',
  'Modelo',
  'Modo',
  'Generado',
] as const;

function title(medium: 'movie' | 'series', estimatedAffinity: number | null): MediaTitleView {
  const name = medium === 'series' ? 'Example' : 'Example Movie';
  return {
    key: mediaPublicKey(medium, name, 2020),
    medium,
    title: name,
    originalTitle: null,
    year: 2020,
    state: medium === 'series' ? 'Terminada' : 'Por ver',
    bankTier: null,
    pool: null,
    radar: false,
    rating: null,
    creator: null,
    genres: ['Drama'],
    countries: [],
    runtimeMinutes: null,
    seasons: medium === 'series' ? 1 : null,
    seasonDetails: [],
    nextSeasonNumber: null,
    posterPath: null,
    affinity: null,
    estimatedAffinity,
    cinephileValue: null,
    culturalImpact: null,
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

test('Series Personal Fit falla cerrado si falta un header canónico', () => {
  const parsed = parseRetrospectiveSeriesAffinity([
    HEADERS.filter((header) => header !== 'Afinidad retrospectiva'),
  ]);
  assert.deepEqual(parsed, { ok: false, missing: ['Afinidad retrospectiva'] });
});

test('Series Personal Fit acepta sólo el modelo y modo retrospectivos versionados', () => {
  const parsed = parseRetrospectiveSeriesAffinity([
    [...HEADERS],
    [
      'id-1',
      'Example',
      2020,
      'Terminada',
      7.625,
      'personal-fit-v1.2-retrospective-display-v1',
      'retrospective_leave_one_out',
      '2026-09-13',
    ],
    [
      'id-2',
      'Ignored',
      2021,
      'Terminada',
      9.5,
      'personal-fit-v1.1',
      'retrospective_leave_one_out',
      '2026-09-13',
    ],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.bySeries.get(mediaPublicKey('series', 'Example', 2020)), 7.625);
  assert.equal(parsed.bySeries.has(mediaPublicKey('series', 'Ignored', 2021)), false);
});

test('la afinidad retrospectiva completa una serie sólo cuando falta una predicción privada', () => {
  const key = mediaPublicKey('series', 'Example', 2020);
  const fallback = new Map([[key, 7.625]]);

  assert.equal(
    withRetrospectiveSeriesAffinity([title('series', null)], fallback)[0]!.estimatedAffinity,
    7.625,
  );
  assert.equal(
    withRetrospectiveSeriesAffinity([title('series', 8.9)], fallback)[0]!.estimatedAffinity,
    8.9,
  );
});

test('Movies nunca consumen la afinidad retrospectiva de Series', () => {
  const movie = title('movie', null);
  const fallback = new Map([[movie.key, 9.2]]);

  assert.equal(withRetrospectiveSeriesAffinity([movie], fallback)[0]!.estimatedAffinity, null);
});
