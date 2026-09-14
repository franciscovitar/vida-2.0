import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildViewingHistoryRow,
  hasCanonicalViewingHistorySchema,
  inspectViewingHistory,
  parseMediaIntakeRequest,
  resolveMediaIntakeTarget,
  shouldWriteCompletionDate,
  snapshotMatchesRequest,
  VIEWING_HISTORY_HEADERS,
} from '@/lib/media/intake';
import { mediaPublicKey } from '@/lib/media/key';

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
  'Fecha vista',
  'Opinión personal',
] as const;

const MOVIE_ROW = [
  'media-1',
  'Heat',
  'Heat',
  1995,
  'Por ver',
  'B',
  'Operativo',
  'No',
  '',
  '',
  '',
] as const;

test('tracker acepta intake observado acotado y rechaza estados/fechas/notas inválidos', () => {
  assert.deepEqual(
    parseMediaIntakeRequest({
      key: 'movie:Heat:1995',
      medium: 'movie',
      state: 'Vista',
      date: '2026-09-14',
      rating: 8.5,
      comment: 'Gran tensión.',
    }),
    {
      key: 'movie:Heat:1995',
      medium: 'movie',
      state: 'Vista',
      date: '2026-09-14',
      rating: 8.5,
      comment: 'Gran tensión.',
    },
  );
  assert.equal(
    parseMediaIntakeRequest({
      key: 'movie:Heat:1995',
      medium: 'movie',
      state: 'Por ver',
      date: '2026-09-14',
      rating: null,
      comment: null,
    }),
    null,
  );
  assert.equal(
    parseMediaIntakeRequest({
      key: 'movie:Heat:1995',
      medium: 'movie',
      state: 'Vista',
      date: '2026-02-31',
      rating: null,
      comment: null,
    }),
    null,
  );
  assert.equal(
    parseMediaIntakeRequest({
      key: 'movie:Heat:1995',
      medium: 'movie',
      state: 'Vista',
      date: '2026-09-14',
      rating: 11,
      comment: null,
    }),
    null,
  );
});

test('tracker resuelve una única fila canónica sin exponer ni regenerar Media ID', () => {
  const key = mediaPublicKey('movie', 'Heat', 1995);
  const result = resolveMediaIntakeTarget('movie', [[...MOVIE_HEADERS], [...MOVIE_ROW]], key);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.target.rowNumber, 2);
  assert.equal(result.target.mediaId, 'media-1');
  assert.equal(result.target.stateColumn, 5);
  assert.equal(result.target.ratingColumn, 9);
  assert.equal(result.target.completionDateColumn, 10);
  assert.equal(result.target.commentColumn, 11);
});

test('tracker falla cerrado ante identidad duplicada o headers observados faltantes', () => {
  const key = mediaPublicKey('movie', 'Heat', 1995);
  const duplicate = resolveMediaIntakeTarget(
    'movie',
    [[...MOVIE_HEADERS], [...MOVIE_ROW], [...MOVIE_ROW]],
    key,
  );
  assert.deepEqual(duplicate, { ok: false, code: 'conflict' });

  const missingHeaders = MOVIE_HEADERS.filter((header) => header !== 'Opinión personal');
  const missing = resolveMediaIntakeTarget('movie', [missingHeaders as unknown as string[]], key);
  assert.deepEqual(missing, { ok: false, code: 'missing-header' });
});

test('Viewing History detecta replay semántico aunque la fecha venga formateada por Sheets', () => {
  const history = [
    [...VIEWING_HISTORY_HEADERS],
    [
      'event-1',
      'media-1',
      'movie',
      'Heat',
      1995,
      'Vista',
      8.5,
      'September 14, 2026',
      'Gran tensión.',
      'Vida Web',
      'Media tracker',
      'Linked',
    ],
  ];
  assert.equal(hasCanonicalViewingHistorySchema(history), true);
  assert.deepEqual(
    inspectViewingHistory(history, {
      mediaId: 'media-1',
      medium: 'movie',
      title: 'Heat',
      year: 1995,
      state: 'Vista',
      rating: 8.5,
      date: '2026-09-14',
      comment: 'Gran tensión.',
    }),
    { ok: true, exists: true },
  );
});

test('evento nuevo usa exactamente el contrato canónico de Viewing History', () => {
  const row = buildViewingHistoryRow('event-2', {
    mediaId: 'media-1',
    medium: 'movie',
    title: 'Heat',
    year: 1995,
    state: 'Vista',
    rating: 8.5,
    date: '2026-09-14',
    comment: 'Gran tensión.',
  });
  assert.deepEqual(row, [
    'event-2',
    'media-1',
    'movie',
    'Heat',
    1995,
    'Vista',
    8.5,
    '2026-09-14',
    'Gran tensión.',
    'Vida Web',
    'Media tracker',
    'Linked',
  ]);
});

test('snapshot verificado conserva semántica de fecha, nota y observación', () => {
  const key = mediaPublicKey('movie', 'Heat', 1995);
  const values = [
    [...MOVIE_HEADERS],
    [
      'media-1',
      'Heat',
      'Heat',
      1995,
      'Vista',
      'B',
      'Operativo',
      'No',
      8.5,
      '14/09/2026',
      'Gran tensión.',
    ],
  ];
  const input = {
    key,
    medium: 'movie' as const,
    state: 'Vista',
    date: '2026-09-14',
    rating: 8.5,
    comment: 'Gran tensión.',
  };
  assert.equal(snapshotMatchesRequest('movie', values, key, input), true);
  assert.equal(shouldWriteCompletionDate('movie', 'Vista'), true);
  assert.equal(shouldWriteCompletionDate('movie', 'Abandonada'), false);
  assert.equal(shouldWriteCompletionDate('series', 'Terminada'), true);
  assert.equal(shouldWriteCompletionDate('series', 'Viendo'), false);
});
