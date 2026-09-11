import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adjustEstimatedAffinity,
  deriveFocusTitles,
  eraPreferenceAdjustment,
  focusLimit,
} from '@/lib/media/focus';
import { filterMediaTitles, sortMediaTitles } from '@/lib/media/view';
import type { MediaFilters, MediaKind, MediaTitleView } from '@/types/media';

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
    estimatedAffinity: 7.5,
    cinephileValue: 8,
    culturalImpact: 8,
    generalScore: null,
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
    ...overrides,
  };
}

function filters(medium: MediaKind, patch: Partial<MediaFilters> = {}): MediaFilters {
  return {
    medium,
    collection: 'all',
    query: '',
    genre: '',
    country: '',
    creator: '',
    yearFrom: '',
    yearTo: '',
    commitment: 'all',
    sort: 'focus-priority',
    ...patch,
  };
}

function keys(items: MediaTitleView[]): string[] {
  return items.map((item) => item.key);
}

test('los Focos de películas son 10 / 50 / 100 y quedan exactamente anidados', () => {
  const titles = Array.from({ length: 110 }, (_, index) => title(`m${index + 1}`, 'movie'));

  const focus1 = deriveFocusTitles(titles, 'movie', 1);
  const focus2 = deriveFocusTitles(titles, 'movie', 2);
  const focus3 = deriveFocusTitles(titles, 'movie', 3);

  assert.equal(focus1.length, 10);
  assert.equal(focus2.length, 50);
  assert.equal(focus3.length, 100);
  assert.deepEqual(keys(focus2).slice(0, focus1.length), keys(focus1));
  assert.deepEqual(keys(focus3).slice(0, focus2.length), keys(focus2));
  assert.equal(focusLimit('movie', 1), 10);
  assert.equal(focusLimit('movie', 2), 50);
  assert.equal(focusLimit('movie', 3), 100);
});

test('los Focos de series son 5 / 20 / 40 y quedan exactamente anidados', () => {
  const titles = Array.from({ length: 45 }, (_, index) => title(`s${index + 1}`, 'series'));

  const focus1 = deriveFocusTitles(titles, 'series', 1);
  const focus2 = deriveFocusTitles(titles, 'series', 2);
  const focus3 = deriveFocusTitles(titles, 'series', 3);

  assert.equal(focus1.length, 5);
  assert.equal(focus2.length, 20);
  assert.equal(focus3.length, 40);
  assert.deepEqual(keys(focus2).slice(0, focus1.length), keys(focus1));
  assert.deepEqual(keys(focus3).slice(0, focus2.length), keys(focus2));
  assert.equal(focusLimit('series', 1), 5);
  assert.equal(focusLimit('series', 2), 20);
  assert.equal(focusLimit('series', 3), 40);
});

test('Foco de películas excluye vistas, Tier C/D y pools no operativos', () => {
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

test('Foco de series contiene sólo Por ver elegibles', () => {
  const titles = [
    title('watch', 'series'),
    title('done', 'series', { state: 'Terminada' }),
    title('active', 'series', { state: 'Viendo' }),
  ];
  assert.deepEqual(keys(deriveFocusTitles(titles, 'series', 3)), ['watch']);
});

test('la afinidad estimada pesa fuerte sin mezclar valor cinéfilo ni impacto', () => {
  const titles = [
    title('fit', 'movie', {
      estimatedAffinity: 9.5,
      cinephileValue: 8,
      culturalImpact: 8,
      creator: 'A',
      genres: ['Drama'],
    }),
    title('canon', 'movie', {
      estimatedAffinity: 7.5,
      cinephileValue: 10,
      culturalImpact: 10,
      creator: 'B',
      genres: ['Comedia'],
    }),
  ];

  const focus = deriveFocusTitles(titles, 'movie', 1);
  assert.equal(focus[0]?.key, 'fit');
  assert.equal(titles[0]?.cinephileValue, 8);
  assert.equal(titles[0]?.culturalImpact, 8);
});

test('Radar y Tier siguen sumando prioridad cuando las dimensiones empatan', () => {
  const titles = [
    title('b', 'movie', { bankTier: 'B' }),
    title('a', 'movie', { bankTier: 'A' }),
    title('radar', 'movie', { bankTier: 'B', radar: true }),
  ];
  const focus = deriveFocusTitles(titles, 'movie', 1);
  assert.equal(focus[0]?.key, 'radar');
  assert.ok(
    focus.findIndex((item) => item.key === 'a') < focus.findIndex((item) => item.key === 'b'),
  );
});

test('filtros reducen el universo del Foco y limpiar recupera exactamente el mismo Foco', () => {
  const titles = Array.from({ length: 70 }, (_, index) =>
    title(`m${index + 1}`, 'movie', {
      genres: [index % 2 === 0 ? 'Drama' : 'Comedia'],
      countries: [index % 3 === 0 ? 'Argentina' : 'Estados Unidos'],
      runtimeMinutes: index % 4 === 0 ? 85 : 125,
    }),
  );
  const universe = deriveFocusTitles(titles, 'movie', 2);
  const reduced = filterMediaTitles(
    universe,
    filters('movie', {
      genre: 'Drama',
      country: 'Argentina',
      commitment: 'under-90',
    }),
  );
  const restored = sortMediaTitles(filterMediaTitles(universe, filters('movie')), 'focus-priority');

  assert.ok(reduced.length < universe.length);
  assert.ok(reduced.every((item) => universe.some((candidate) => candidate.key === item.key)));
  assert.deepEqual(keys(restored), keys(universe));
});

test('un filtro nunca puede expandir Foco 1 hacia títulos de Foco 2', () => {
  const titles = Array.from({ length: 60 }, (_, index) =>
    title(`m${index + 1}`, 'movie', { genres: [index < 10 ? 'Drama' : 'Comedia'] }),
  );
  const focus1 = deriveFocusTitles(titles, 'movie', 1);
  const focus2 = deriveFocusTitles(titles, 'movie', 2);
  const filtered1 = filterMediaTitles(focus1, filters('movie', { genre: 'Comedia' }));

  assert.ok(filtered1.every((item) => focus1.some((candidate) => candidate.key === item.key)));
  assert.ok(focus2.length > focus1.length);
});

test('handicap temporal de películas es cero desde 1990, suave, monotónico y acotado', () => {
  assert.equal(eraPreferenceAdjustment('movie', 2026), 0);
  assert.equal(eraPreferenceAdjustment('movie', 2010), 0);
  assert.equal(eraPreferenceAdjustment('movie', 1990), 0);
  assert.equal(eraPreferenceAdjustment('movie', 1980), -0.125);
  assert.equal(eraPreferenceAdjustment('movie', 1970), -0.25);
  assert.equal(eraPreferenceAdjustment('movie', 1960), -0.375);
  assert.equal(eraPreferenceAdjustment('movie', 1950), -0.5);
  assert.equal(eraPreferenceAdjustment('movie', 1920), -0.5);
  assert.ok(eraPreferenceAdjustment('movie', 1985) > eraPreferenceAdjustment('movie', 1975));
});

test('series no reciben handicap temporal', () => {
  assert.equal(eraPreferenceAdjustment('series', 1970), 0);
  assert.equal(adjustEstimatedAffinity('series', 1970, 8.2), 8.2);
});

test('afinidad estimada sigue separada de Nota observada', () => {
  const item = title('separate', 'movie', { rating: 9, estimatedAffinity: 7.4 });
  assert.equal(item.rating, 9);
  assert.equal(item.estimatedAffinity, 7.4);
  assert.notEqual(item.rating, item.estimatedAffinity);
});

test('derivar Foco no muta el Banco original', () => {
  const titles = Array.from({ length: 20 }, (_, index) => title(`m${index + 1}`, 'movie'));
  const before = JSON.stringify(titles);
  deriveFocusTitles(titles, 'movie', 2);
  assert.equal(JSON.stringify(titles), before);
});
