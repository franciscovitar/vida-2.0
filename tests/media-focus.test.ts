import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveFocusTitles, focusLimit } from '@/lib/media/focus';
import type { MediaKind, MediaTitleView } from '@/types/media';

function title(
  key: string,
  medium: MediaKind,
  overrides: Partial<MediaTitleView> = {},
): MediaTitleView {
  const index = Number(key.replace(/\D/g, '')) || 1;
  return {
    key,
    medium,
    title: `Título ${key}`,
    originalTitle: null,
    year: 2026 - (index % 30),
    state: 'Por ver',
    bankTier: medium === 'movie' ? 'B' : null,
    pool: medium === 'movie' ? 'Operativo' : null,
    radar: false,
    rating: null,
    creator: `Creador ${index}`,
    genres: [`Género ${index}`],
    countries: ['Argentina'],
    runtimeMinutes: medium === 'movie' ? 110 : 50,
    seasons: medium === 'series' ? 1 : null,
    affinity: null,
    cinephileValue: 10 - (index % 10) / 10,
    culturalImpact: 9 - (index % 10) / 10,
    generalScore: null,
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
    ...overrides,
  };
}

function keys(items: MediaTitleView[]): string[] {
  return items.map((item) => item.key);
}

test('los tres Focos de películas son anidados y respetan 6 / 18 / 40', () => {
  const titles = Array.from({ length: 50 }, (_, index) => title(`m${index + 1}`, 'movie'));

  const focus1 = deriveFocusTitles(titles, 'movie', 1);
  const focus2 = deriveFocusTitles(titles, 'movie', 2);
  const focus3 = deriveFocusTitles(titles, 'movie', 3);

  assert.equal(focus1.length, 6);
  assert.equal(focus2.length, 18);
  assert.equal(focus3.length, 40);
  assert.deepEqual(keys(focus2).slice(0, focus1.length), keys(focus1));
  assert.deepEqual(keys(focus3).slice(0, focus2.length), keys(focus2));
  assert.equal(focusLimit('movie', 1), 6);
  assert.equal(focusLimit('movie', 2), 18);
  assert.equal(focusLimit('movie', 3), 40);
});

test('los tres Focos de series son anidados y respetan 3 / 8 / 16', () => {
  const titles = Array.from({ length: 20 }, (_, index) => title(`s${index + 1}`, 'series'));

  const focus1 = deriveFocusTitles(titles, 'series', 1);
  const focus2 = deriveFocusTitles(titles, 'series', 2);
  const focus3 = deriveFocusTitles(titles, 'series', 3);

  assert.equal(focus1.length, 3);
  assert.equal(focus2.length, 8);
  assert.equal(focus3.length, 16);
  assert.deepEqual(keys(focus2).slice(0, focus1.length), keys(focus1));
  assert.deepEqual(keys(focus3).slice(0, focus2.length), keys(focus2));
});

test('Foco de películas excluye vistas, Reserva, Salida candidata y pools no operativos', () => {
  const titles = [
    title('ok-a', 'movie', { bankTier: 'A' }),
    title('ok-b', 'movie', { bankTier: 'B' }),
    title('seen', 'movie', { state: 'Vista', bankTier: 'A' }),
    title('reserve', 'movie', { bankTier: 'C', pool: 'Reserva' }),
    title('exit', 'movie', { bankTier: 'D', pool: 'Salida candidata' }),
    title('wrong-pool', 'movie', { bankTier: 'A', pool: 'Reserva' }),
  ];

  assert.deepEqual(new Set(keys(deriveFocusTitles(titles, 'movie', 3))), new Set(['ok-a', 'ok-b']));
});

test('Radar y Tier A conservan prioridad antes de la diversidad blanda', () => {
  const titles = [
    title('b1', 'movie', {
      bankTier: 'B',
      cinephileValue: 10,
      culturalImpact: 10,
      creator: 'B',
      genres: ['Drama'],
    }),
    title('a1', 'movie', {
      bankTier: 'A',
      cinephileValue: 8,
      culturalImpact: 8,
      creator: 'A',
      genres: ['Comedia'],
    }),
    title('radar', 'movie', {
      bankTier: 'B',
      radar: true,
      cinephileValue: 7,
      culturalImpact: 7,
      creator: 'R',
      genres: ['Thriller'],
    }),
  ];

  const focus = deriveFocusTitles(titles, 'movie', 1);
  assert.equal(focus[0]?.key, 'radar');
  assert.ok(focus.findIndex((item) => item.key === 'a1') < focus.findIndex((item) => item.key === 'b1'));
});

test('derivar Foco no muta el Banco original', () => {
  const titles = Array.from({ length: 10 }, (_, index) => title(`m${index + 1}`, 'movie'));
  const before = JSON.stringify(titles);
  deriveFocusTitles(titles, 'movie', 2);
  assert.equal(JSON.stringify(titles), before);
});
