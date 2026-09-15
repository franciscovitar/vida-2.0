import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mediaPublicKey } from '@/lib/media/key';
import {
  mergeObservedSeasonRating,
  parseSeriesSeasonRatingRequest,
  resolveSeriesSeasonRatingTarget,
  seasonRatingSnapshotMatches,
} from '@/lib/media/season-rating';

const HEADERS = ['Media ID', 'Título', 'Año', 'Temporadas', 'Notas por temporada'] as const;

const ROW = ['series-1', 'Example', 2020, 4, 'T1 8.4 / T3 7.125'] as const;

test('acepta cualquier decimal entre 0 y 10 para una temporada', () => {
  assert.deepEqual(
    parseSeriesSeasonRatingRequest({
      key: 'series:Example:2020',
      seasonNumber: 2,
      rating: 8.4,
    }),
    { key: 'series:Example:2020', seasonNumber: 2, rating: 8.4 },
  );
  assert.deepEqual(
    parseSeriesSeasonRatingRequest({
      key: 'series:Example:2020',
      seasonNumber: 2,
      rating: 8.407,
    }),
    { key: 'series:Example:2020', seasonNumber: 2, rating: 8.407 },
  );
  assert.equal(
    parseSeriesSeasonRatingRequest({
      key: 'series:Example:2020',
      seasonNumber: 2,
      rating: 10.01,
    }),
    null,
  );
});

test('resolver apunta sólo a Notas por temporada de una identidad inequívoca', () => {
  const key = mediaPublicKey('series', 'Example', 2020);
  const result = resolveSeriesSeasonRatingTarget([[...HEADERS], [...ROW]], key);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.target.rowNumber, 2);
  assert.equal(result.target.mediaId, 'series-1');
  assert.equal(result.target.seasonRatingsColumn, 5);
  assert.equal(result.target.totalSeasons, 4);
});

test('merge preserva otras temporadas, ordena y permite borrar una nota', () => {
  assert.equal(
    mergeObservedSeasonRating('T1 8.4 / T3 7.125', 2, 9.33),
    'T1 8.4 / T2 9.33 / T3 7.125',
  );
  assert.equal(mergeObservedSeasonRating('T1 8.4 / T3 7.125', 1, null), 'T3 7.125');
});

test('read-back semántico confirma exactamente la temporada tocada', () => {
  const key = mediaPublicKey('series', 'Example', 2020);
  const values = [[...HEADERS], [...ROW]];
  assert.equal(seasonRatingSnapshotMatches(values, key, 1, 8.4), true);
  assert.equal(seasonRatingSnapshotMatches(values, key, 2, null), true);
  assert.equal(seasonRatingSnapshotMatches(values, key, 3, 7.125), true);
  assert.equal(seasonRatingSnapshotMatches(values, key, 3, 7.12), false);
});
