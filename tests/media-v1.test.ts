import assert from 'node:assert/strict';
import { test } from 'node:test';

import { primaryNav } from '@/lib/constants/navigation';
import { parseMediaTab } from '@/lib/media/parse';
import { getMediaSpreadsheetId } from '@/lib/media/sheets-config';
import { filterMediaTitles, sortMediaTitles } from '@/lib/media/view';
import type { MediaFilters, MediaTitleView } from '@/types/media';

const MOVIE_HEADERS = [
  'Media ID',
  'Título',
  'Título original',
  'Año',
  'Estado',
  'Tier banco',
  'Pool',
  'Radar',
  'Nota',
  'Director',
  'Géneros',
  'País',
  'Duración min',
  'TMDB ID',
  'IMDb ID',
  'Afinidad personal',
  'Valor cinéfilo',
  'Impacto cultural',
  'Score general',
  'Por qué para mí',
  'Provenance',
  'Source URL',
] as const;

function movieRow(input: {
  id: string;
  title: string;
  year: number;
  state?: string;
  tier?: string;
  rating?: number;
  director?: string;
  genres?: string;
  country?: string;
  runtime?: number;
  generalScore?: number;
}) {
  const values: Record<(typeof MOVIE_HEADERS)[number], string | number> = {
    'Media ID': input.id,
    Título: input.title,
    'Título original': '',
    Año: input.year,
    Estado: input.state ?? 'Por ver',
    'Tier banco': input.tier ?? 'B',
    Pool: 'Operativo',
    Radar: 'No',
    Nota: input.rating ?? '',
    Director: input.director ?? '',
    Géneros: input.genres ?? '',
    País: input.country ?? '',
    'Duración min': input.runtime ?? '',
    'TMDB ID': 'tmdb:movie:123',
    'IMDb ID': 'tt123',
    'Afinidad personal': '',
    'Valor cinéfilo': '',
    'Impacto cultural': '',
    'Score general': input.generalScore ?? '',
    'Por qué para mí': '',
    Provenance: 'internal evidence',
    'Source URL': 'https://example.invalid/internal',
  };
  return MOVIE_HEADERS.map((header) => values[header]);
}

function filters(patch: Partial<MediaFilters> = {}): MediaFilters {
  return {
    medium: 'movie',
    collection: 'all',
    query: '',
    genre: '',
    country: '',
    creator: '',
    decade: '',
    commitment: 'all',
    sort: 'bank-priority',
    ...patch,
  };
}

function title(
  input: Partial<MediaTitleView> & Pick<MediaTitleView, 'key' | 'title'>,
): MediaTitleView {
  const { key, title: titleText, ...overrides } = input;
  return {
    key,
    medium: 'movie',
    title: titleText,
    originalTitle: null,
    year: null,
    state: 'Por ver',
    bankTier: 'B',
    pool: 'Operativo',
    radar: false,
    rating: null,
    creator: null,
    genres: [],
    countries: [],
    runtimeMinutes: null,
    seasons: null,
    affinity: null,
    cinephileValue: null,
    culturalImpact: null,
    generalScore: null,
    whyForMe: null,
    ...overrides,
  };
}

test('Media usa exclusivamente su spreadsheet dedicado', () => {
  assert.equal(
    getMediaSpreadsheetId({
      GOOGLE_SHEETS_PROD_ID: 'general_prod_sheet_example_123456',
      GOOGLE_SHEETS_DEV_ID: 'general_dev_sheet_example_1234567',
    }),
    null,
  );
  assert.equal(
    getMediaSpreadsheetId({
      GOOGLE_MEDIA_SPREADSHEET_ID: 'media_sheet_example_1234567890',
    }),
    'media_sheet_example_1234567890',
  );
});

test('parser de Movies entrega sólo campos de presentación, sin IDs/provenance/source URL', () => {
  const parsed = parseMediaTab('Movies', [
    [...MOVIE_HEADERS],
    movieRow({
      id: 'private-media-id',
      title: 'Parásitos',
      year: 2019,
      director: 'Bong Joon-ho',
      genres: 'Drama, Thriller',
      country: 'Corea del Sur',
      runtime: 132,
      rating: 9,
    }),
  ]);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.titles.length, 1);
  assert.equal(parsed.titles[0]?.title, 'Parásitos');
  assert.equal(parsed.titles[0]?.creator, 'Bong Joon-ho');
  assert.deepEqual(parsed.titles[0]?.genres, ['Drama', 'Thriller']);
  assert.equal('mediaId' in parsed.titles[0]!, false);
  assert.equal('tmdbId' in parsed.titles[0]!, false);
  assert.equal('imdbId' in parsed.titles[0]!, false);
  assert.equal('provenance' in parsed.titles[0]!, false);
  assert.equal('sourceUrl' in parsed.titles[0]!, false);
});

test('parser falla cerrado cuando falta un header canónico de presentación', () => {
  const headers = MOVIE_HEADERS.filter((header) => header !== 'Duración min');
  const parsed = parseMediaTab('Movies', [headers]);
  assert.deepEqual(parsed, { ok: false, missing: ['Duración min'] });
});

test('búsqueda y filtros son tolerantes a acentos y respetan el Banco', () => {
  const titles = [
    title({
      key: 'parasitos',
      title: 'Parásitos',
      year: 2019,
      creator: 'Bong Joon-ho',
      genres: ['Drama', 'Thriller'],
      countries: ['Corea del Sur'],
      runtimeMinutes: 132,
    }),
    title({
      key: 'amélie',
      title: 'Amélie',
      year: 2001,
      state: 'Vista',
      creator: 'Jean-Pierre Jeunet',
      genres: ['Comedia', 'Romance'],
      countries: ['Francia'],
      runtimeMinutes: 122,
      rating: 8.5,
    }),
  ];

  assert.deepEqual(
    filterMediaTitles(titles, filters({ query: 'parasitos', collection: 'bank' })).map(
      (item) => item.key,
    ),
    ['parasitos'],
  );
  assert.deepEqual(
    filterMediaTitles(titles, filters({ country: 'Francia', collection: 'seen' })).map(
      (item) => item.key,
    ),
    ['amélie'],
  );
});

test('filtro de duración no interpreta metadata faltante como una duración real', () => {
  const titles = [
    title({ key: 'short', title: 'Corta', runtimeMinutes: 88 }),
    title({ key: 'unknown', title: 'Sin duración', runtimeMinutes: null }),
  ];
  assert.deepEqual(
    filterMediaTitles(titles, filters({ commitment: 'under-90' })).map((item) => item.key),
    ['short'],
  );
});

test('orden del Banco prioriza Radar y Tier sin inventar score', () => {
  const titles = [
    title({ key: 'b', title: 'B', bankTier: 'B' }),
    title({ key: 'a', title: 'A', bankTier: 'A' }),
    title({ key: 'radar', title: 'Radar', bankTier: 'B', radar: true }),
  ];
  assert.deepEqual(sortMediaTitles(titles, 'bank-priority').map((item) => item.key), [
    'radar',
    'a',
    'b',
  ]);
});

test('Media aparece en la navegación principal', () => {
  assert.ok(primaryNav.some((item) => item.href === '/media' && item.label === 'Media'));
});
