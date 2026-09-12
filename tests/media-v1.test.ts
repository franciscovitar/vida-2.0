import assert from 'node:assert/strict';
import { test } from 'node:test';

import { primaryNav } from '@/lib/constants/navigation';
import { parseMediaTab } from '@/lib/media/parse';
import { areMediaSheetWritesAllowed, getMediaSpreadsheetId } from '@/lib/media/sheets-config';
import { deriveMediaFilterOptions, filterMediaTitles, sortMediaTitles } from '@/lib/media/view';
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
  'Lote manual',
  'Poster TMDB',
  'Por qué para mí',
  'Resumen sin spoilers',
  'Qué esperar',
  'Perfil experiencia',
  'Confianza experiencia',
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
  manualFocus?: number | 'exclude';
  poster?: string;
  profile?: string;
  summary?: string;
  whatToExpect?: string;
  experienceConfidence?: number;
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
    'Score general': '',
    'Lote manual': input.manualFocus ?? '',
    'Poster TMDB': input.poster ?? '',
    'Por qué para mí': '',
    'Resumen sin spoilers': input.summary ?? '',
    'Qué esperar': input.whatToExpect ?? '',
    'Perfil experiencia': input.profile ?? '',
    'Confianza experiencia': input.experienceConfidence ?? '',
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
    yearFrom: '',
    yearTo: '',
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
    posterPath: null,
    affinity: null,
    estimatedAffinity: null,
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
    getMediaSpreadsheetId({ GOOGLE_MEDIA_SPREADSHEET_ID: 'media_sheet_example_1234567890' }),
    'media_sheet_example_1234567890',
  );
});

test('escrituras Media nacen apagadas y requieren literal exacto true', () => {
  assert.equal(areMediaSheetWritesAllowed({}), false);
  assert.equal(areMediaSheetWritesAllowed({ GOOGLE_MEDIA_SHEETS_ALLOW_WRITES: 'TRUE' }), false);
  assert.equal(areMediaSheetWritesAllowed({ GOOGLE_MEDIA_SHEETS_ALLOW_WRITES: 'true' }), true);
});

test('parser entrega presentación, poster y señales derivadas sin IDs ni perfil crudo', () => {
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
      manualFocus: 2,
      poster: '/poster.jpg',
      profile: JSON.stringify({ pace: 'fast', visual_emphasis: 'high' }),
      summary: 'Una familia se cruza con otra de una posición social muy distinta.',
      whatToExpect: 'Thriller social de tono cambiante, con humor negro y tensión creciente.',
      experienceConfidence: 90,
    }),
  ]);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const item = parsed.titles[0]!;
  assert.equal(item.title, 'Parásitos');
  assert.equal(item.creator, 'Bong Joon-ho');
  assert.deepEqual(item.genres, ['Drama', 'Thriller']);
  assert.equal(item.posterPath, '/poster.jpg');
  assert.equal(item.estimatedAffinity, null);
  assert.equal(item.manualFocusLevel, 2);
  assert.equal(item.manualFocusExcluded, false);
  assert.ok(item.ageFeelScore !== null);
  assert.ok(item.ageFeelLabel?.startsWith('Se siente'));
  assert.equal('mediaId' in item, false);
  assert.equal('tmdbId' in item, false);
  assert.equal('imdbId' in item, false);
  assert.equal('provenance' in item, false);
  assert.equal('sourceUrl' in item, false);
  assert.equal('experienceProfile' in item, false);
});

test('parser reconoce exclude sin confundirlo con un lote', () => {
  const parsed = parseMediaTab('Movies', [
    [...MOVIE_HEADERS],
    movieRow({ id: 'x', title: 'Fuera', year: 2020, manualFocus: 'exclude' }),
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.titles[0]?.manualFocusExcluded, true);
  assert.equal(parsed.titles[0]?.manualFocusLevel, null);
});

test('parser falla cerrado cuando falta un header canónico de presentación', () => {
  const headers = MOVIE_HEADERS.filter((header) => header !== 'Duración min');
  const parsed = parseMediaTab('Movies', [headers]);
  assert.deepEqual(parsed, { ok: false, missing: ['Duración min'] });
});

test('Poster TMDB es aditivo: el parser sigue funcionando si esa columna aún no existe', () => {
  const headers = MOVIE_HEADERS.filter((header) => header !== 'Poster TMDB');
  const parsed = parseMediaTab('Movies', [headers]);
  assert.equal(parsed.ok, true);
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
    filterMediaTitles(titles, filters({ query: 'parasitos', collection: 'bank' })).map((item) => item.key),
    ['parasitos'],
  );
  assert.deepEqual(
    filterMediaTitles(titles, filters({ country: 'Francia', collection: 'seen' })).map((item) => item.key),
    ['amélie'],
  );
});

test('filtro de años devuelve rango inclusivo y el orden puede invertirse', () => {
  const titles = [
    title({ key: '1999', title: '1999', year: 1999 }),
    title({ key: '2000', title: '2000', year: 2000 }),
    title({ key: '2005', title: '2005', year: 2005 }),
    title({ key: '2010', title: '2010', year: 2010 }),
    title({ key: 'unknown', title: 'Sin año', year: null }),
  ];
  const scoped = filterMediaTitles(titles, filters({ yearFrom: '2000', yearTo: '2010' }));
  assert.deepEqual(scoped.map((item) => item.key), ['2000', '2005', '2010']);
  assert.deepEqual(sortMediaTitles(scoped, 'year-asc').map((item) => item.key), ['2000', '2005', '2010']);
  assert.deepEqual(sortMediaTitles(scoped, 'year-desc').map((item) => item.key), ['2010', '2005', '2000']);
});

test('filtro de duración no interpreta metadata faltante como duración real', () => {
  const titles = [
    title({ key: 'short', title: 'Corta', runtimeMinutes: 88 }),
    title({ key: 'unknown', title: 'Sin duración', runtimeMinutes: null }),
  ];
  assert.deepEqual(filterMediaTitles(titles, filters({ commitment: 'under-90' })).map((item) => item.key), ['short']);
});

test('orden del Banco prioriza Radar y Tier sin inventar score', () => {
  const titles = [
    title({ key: 'b', title: 'B', bankTier: 'B' }),
    title({ key: 'a', title: 'A', bankTier: 'A' }),
    title({ key: 'radar', title: 'Radar', bankTier: 'B', radar: true }),
  ];
  assert.deepEqual(sortMediaTitles(titles, 'bank-priority').map((item) => item.key), ['radar', 'a', 'b']);
});

test('dimensiones inferidas, prioridad y afinidad se ordenan por separado y en ambos sentidos', () => {
  const titles = [
    title({ key: 'a', title: 'A', estimatedAffinity: 9.41, cinephileValue: 9.1, culturalImpact: 6.5 }),
    title({ key: 'b', title: 'B', estimatedAffinity: 7.13, cinephileValue: 7.4, culturalImpact: 8.8 }),
    title({ key: 'unknown', title: 'Sin scores' }),
  ];
  assert.deepEqual(sortMediaTitles(titles, 'estimated-affinity-desc').map((item) => item.key), ['a', 'b', 'unknown']);
  assert.deepEqual(sortMediaTitles(titles, 'estimated-affinity-asc').map((item) => item.key), ['b', 'a', 'unknown']);
  assert.deepEqual(sortMediaTitles(titles, 'focus-priority').map((item) => item.key), ['a', 'b', 'unknown']);
  assert.deepEqual(sortMediaTitles(titles, 'focus-priority-asc').map((item) => item.key), ['b', 'a', 'unknown']);
  const options = deriveMediaFilterOptions(titles, 'movie');
  assert.equal(options.hasEstimatedAffinity, true);
  assert.equal(options.hasCinephile, true);
  assert.equal(options.hasCultural, true);
  assert.equal(options.hasWatchPriority, true);
});

test('Media aparece en la navegación principal', () => {
  assert.ok(primaryNav.some((item) => item.href === '/media' && item.label === 'Media'));
});
