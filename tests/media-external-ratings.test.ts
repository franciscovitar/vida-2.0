import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mdblistIdentityMatches,
  normalizeMdblistRatings,
  resolveExternalRatingsTarget,
} from '../lib/media/external-ratings';

const HEADERS = ['Título', 'Año', 'TMDB ID', 'IMDb ID'];

test('resuelve la identidad externa por key pública sin exponerla en la vista principal', () => {
  const result = resolveExternalRatingsTarget(
    [HEADERS, ['The Example', 2020, 'tmdb:movie:123', 'tt4567890']],
    'movie',
    'movie:The Example:2020',
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.target, {
    medium: 'movie',
    imdbId: 'tt4567890',
    tmdbId: 123,
  });
});

test('falla cerrado si una key pública coincide con más de una fila', () => {
  const rows = [
    HEADERS,
    ['Duplicate', 2020, 'tmdb:movie:1', 'tt1111111'],
    ['Duplicate', 2020, 'tmdb:movie:2', 'tt2222222'],
  ];
  assert.deepEqual(resolveExternalRatingsTarget(rows, 'movie', 'movie:Duplicate:2020'), {
    ok: false,
    code: 'conflict',
  });
});

test('normaliza cinco fuentes seleccionadas a escala 0-10 y calcula promedio simple', () => {
  const result = normalizeMdblistRatings({
    ratings: [
      { source: 'imdb', score: 84 },
      { source: 'letterboxd', score: 82 },
      { source: 'tomatoes', score: 91 },
      { source: 'metacritic', score: 76 },
      { source: 'tmdb', score: 79 },
      { source: 'popcorn', score: 95 },
      { source: 'trakt', score: 88 },
    ],
  });

  assert.deepEqual(
    result.ratings.map((rating) => [rating.source, rating.score]),
    [
      ['imdb', 8.4],
      ['letterboxd', 8.2],
      ['rottentomatoes', 9.1],
      ['metacritic', 7.6],
      ['tmdb', 7.9],
    ],
  );
  assert.equal(result.average, 8.24);
});

test('ignora scores inválidos y no inventa promedio cuando no hay fuentes válidas', () => {
  assert.deepEqual(
    normalizeMdblistRatings({
      ratings: [
        { source: 'imdb', score: null },
        { source: 'letterboxd', score: 120 },
        { source: 'trakt', score: 85 },
      ],
    }),
    { ratings: [], average: null },
  );
});

test('valida que la respuesta de MDBList corresponda a la identidad interna esperada', () => {
  const target = { medium: 'series' as const, imdbId: 'tt1234567', tmdbId: 987 };

  assert.equal(
    mdblistIdentityMatches(
      {
        type: 'show',
        ids: { imdb: 'tt1234567', tmdb: 987 },
      },
      target,
    ),
    true,
  );
  assert.equal(
    mdblistIdentityMatches(
      {
        type: 'show',
        ids: { imdb: 'tt1234567', tmdb: 999 },
      },
      target,
    ),
    false,
  );
});
