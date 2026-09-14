import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDisplayAffinity, withDisplayAffinity } from '@/lib/media/display-affinity';
import { adjustEstimatedAffinity } from '@/lib/media/focus';
import { mediaPublicKey } from '@/lib/media/key';
import type { MediaTitleView } from '@/types/media';

const HEADERS = [
  'Media ID',
  'Tipo',
  'Título',
  'Año',
  'Estado al generar',
  'Afinidad display',
  'Confianza',
  'Modelo',
  'Modo',
  'Generado',
] as const;

function title(
  medium: 'movie' | 'series',
  state: string,
  estimatedAffinity: number | null = null,
): MediaTitleView {
  const name = medium === 'series' ? 'Example Series' : 'Example Movie';
  return {
    key: mediaPublicKey(medium, name, 2020),
    medium,
    title: name,
    originalTitle: null,
    year: 2020,
    state,
    bankTier: null,
    pool: null,
    radar: false,
    rating: null,
    creator: null,
    genres: ['Drama'],
    countries: [],
    runtimeMinutes: medium === 'movie' ? 110 : 45,
    seasons: medium === 'series' ? 2 : null,
    seasonDetails: [],
    nextSeasonNumber: null,
    posterPath: null,
    affinity: null,
    estimatedAffinity,
    cinephileValue: 8,
    culturalImpact: 8,
    generalScore: null,
    manualFocusLevel: null,
    manualFocusExcluded: false,
    ageFeelScore: medium === 'movie' ? 8 : null,
    ageFeelLabel: null,
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
  };
}

function parsedMap() {
  const parsed = parseDisplayAffinity([
    [...HEADERS],
    [
      'movie-id',
      'movie',
      'Example Movie',
      2020,
      'Por ver',
      8,
      60,
      'personal-fit-v1.2',
      'current_catalog_display_fallback',
      '2026-09-14',
    ],
    [
      'series-id',
      'series',
      'Example Series',
      2020,
      'Terminada',
      7.5,
      55,
      'personal-fit-v1.2',
      'current_catalog_display_fallback',
      '2026-09-14',
    ],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error('fixture inválido');
  return parsed.byTitle;
}

test('Media Personal Fit Display falla cerrado si falta un header canónico', () => {
  const parsed = parseDisplayAffinity([HEADERS.filter((header) => header !== 'Afinidad display')]);
  assert.deepEqual(parsed, { ok: false, missing: ['Afinidad display'] });
});

test('acepta sólo el modelo y modo de fallback versionados', () => {
  const parsed = parseDisplayAffinity([
    [...HEADERS],
    [
      'ok',
      'movie',
      'Example Movie',
      2020,
      'Por ver',
      8,
      60,
      'personal-fit-v1.2',
      'current_catalog_display_fallback',
      '2026-09-14',
    ],
    [
      'ignored',
      'movie',
      'Ignored',
      2020,
      'Por ver',
      9,
      70,
      'personal-fit-v1.1',
      'current_catalog_display_fallback',
      '2026-09-14',
    ],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.byTitle.get(mediaPublicKey('movie', 'Example Movie', 2020)), 8);
  assert.equal(parsed.byTitle.has(mediaPublicKey('movie', 'Ignored', 2020)), false);
});

test('completa película no vista y conserva el ajuste temporal de afinidad', () => {
  const movie = title('movie', 'Por ver');
  const result = withDisplayAffinity([movie], parsedMap())[0]!;
  assert.equal(result.estimatedAffinity, adjustEstimatedAffinity('movie', 8, 8));
});

test('no completa películas Vista ni Reveer', () => {
  const result = withDisplayAffinity(
    [title('movie', 'Vista'), title('movie', 'Reveer')],
    parsedMap(),
  );
  assert.equal(result[0]!.estimatedAffinity, null);
  assert.equal(result[1]!.estimatedAffinity, null);
});

test('completa Series sin importar que ya estén terminadas', () => {
  const series = title('series', 'Terminada');
  assert.equal(withDisplayAffinity([series], parsedMap())[0]!.estimatedAffinity, 7.5);
});

test('una afinidad previa privada o retrospectiva siempre gana sobre el fallback amplio', () => {
  const movie = title('movie', 'Por ver', 8.9);
  const series = title('series', 'Terminada', 8.7);
  const result = withDisplayAffinity([movie, series], parsedMap());
  assert.equal(result[0]!.estimatedAffinity, 8.9);
  assert.equal(result[1]!.estimatedAffinity, 8.7);
});
