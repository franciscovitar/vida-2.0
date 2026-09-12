import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adjustEstimatedAffinity,
  deriveFocusCandidates,
  deriveFocusTitles,
  eraPreferenceAdjustment,
  focusLimit,
  watchPriorityScore,
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
    manualFocusLevel: null,
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

test('los lotes de películas son top 10 / 50 / 100 y quedan anidados', () => {
  const titles = Array.from({ length: 110 }, (_, index) =>
    title(`m${index + 1}`, 'movie', { estimatedAffinity: 10 - index / 20 }),
  );

  const lot1 = deriveFocusTitles(titles, 'movie', 1);
  const lot2 = deriveFocusTitles(titles, 'movie', 2);
  const lot3 = deriveFocusTitles(titles, 'movie', 3);

  assert.equal(lot1.length, 10);
  assert.equal(lot2.length, 50);
  assert.equal(lot3.length, 100);
  assert.ok(keys(lot1).every((key) => keys(lot2).includes(key)));
  assert.ok(keys(lot2).every((key) => keys(lot3).includes(key)));
  assert.equal(focusLimit('movie', 1), 10);
  assert.equal(focusLimit('movie', 2), 50);
  assert.equal(focusLimit('movie', 3), 100);
});

test('los lotes de series son top 5 / 20 / 40 y quedan anidados', () => {
  const titles = Array.from({ length: 45 }, (_, index) =>
    title(`s${index + 1}`, 'series', { estimatedAffinity: 10 - index / 20 }),
  );

  const lot1 = deriveFocusTitles(titles, 'series', 1);
  const lot2 = deriveFocusTitles(titles, 'series', 2);
  const lot3 = deriveFocusTitles(titles, 'series', 3);

  assert.equal(lot1.length, 5);
  assert.equal(lot2.length, 20);
  assert.equal(lot3.length, 40);
  assert.ok(keys(lot1).every((key) => keys(lot2).includes(key)));
  assert.ok(keys(lot2).every((key) => keys(lot3).includes(key)));
  assert.equal(focusLimit('series', 1), 5);
  assert.equal(focusLimit('series', 2), 20);
  assert.equal(focusLimit('series', 3), 40);
});

test('películas automáticas excluyen vistas, Tier C/D y pools no operativos', () => {
  const titles = [
    title('ok-a', 'movie', { bankTier: 'A' }),
    title('ok-b', 'movie', { bankTier: 'B' }),
    title('seen', 'movie', { state: 'Vista', bankTier: 'A' }),
    title('reserve', 'movie', { bankTier: 'C', pool: 'Reserva' }),
    title('exit', 'movie', { bankTier: 'D', pool: 'Salida candidata' }),
    title('wrong-pool', 'movie', { bankTier: 'A', pool: 'Reserva' }),
  ];

  assert.deepEqual(new Set(keys(deriveFocusCandidates(titles, 'movie'))), new Set(['ok-a', 'ok-b']));
});

test('una prioridad manual vuelve elegible una película Por ver fuera del pool automático', () => {
  const pinned = title('reserve', 'movie', {
    bankTier: 'C',
    pool: 'Reserva',
    manualFocusLevel: 2,
  });
  assert.deepEqual(keys(deriveFocusCandidates([pinned], 'movie')), ['reserve']);
});

test('series automáticas contienen sólo Por ver', () => {
  const titles = [
    title('watch', 'series'),
    title('done', 'series', { state: 'Terminada' }),
    title('active', 'series', { state: 'Viendo' }),
  ];
  assert.deepEqual(keys(deriveFocusTitles(titles, 'series', 3)), ['watch']);
});

test('Prioridad de visionado usa 55% afinidad, 25% cinéfilo y 20% impacto', () => {
  const item = title('weighted', 'movie', {
    estimatedAffinity: 9,
    cinephileValue: 8,
    culturalImpact: 7,
  });
  assert.equal(watchPriorityScore(item), 9 * 0.55 + 8 * 0.25 + 7 * 0.2);
});

test('Prioridad de visionado renormaliza cuando falta una dimensión', () => {
  const item = title('partial', 'movie', {
    estimatedAffinity: null,
    cinephileValue: 10,
    culturalImpact: 5,
  });
  assert.equal(watchPriorityScore(item), (10 * 0.25 + 5 * 0.2) / 0.45);
});

test('Radar y Tier no cambian la nota global y sólo desempatan ranking', () => {
  const base = title('b', 'movie', { bankTier: 'B' });
  const tierA = title('a', 'movie', { bankTier: 'A' });
  const radar = title('radar', 'movie', { bankTier: 'B', radar: true });
  assert.equal(watchPriorityScore(base), watchPriorityScore(tierA));
  assert.equal(watchPriorityScore(base), watchPriorityScore(radar));

  const lot = deriveFocusTitles([base, tierA, radar], 'movie', 1);
  assert.equal(lot[0]?.key, 'radar');
  assert.ok(lot.findIndex((item) => item.key === 'a') < lot.findIndex((item) => item.key === 'b'));
});

test('filtrar primero recalcula top 50 del universo filtrado', () => {
  const titles = Array.from({ length: 100 }, (_, index) =>
    title(`m${index + 1}`, 'movie', {
      year: index < 60 ? 2000 + (index % 20) : 1980,
      estimatedAffinity: 10 - index / 20,
    }),
  );
  const candidates = deriveFocusCandidates(titles, 'movie');
  const filtered = filterMediaTitles(candidates, filters('movie', { yearFrom: '1990', yearTo: '2026' }));
  const lot2 = deriveFocusTitles(filtered, 'movie', 2);

  assert.equal(filtered.length, 60);
  assert.equal(lot2.length, 50);
  assert.ok(lot2.every((item) => item.year !== null && item.year >= 1990 && item.year <= 2026));
  assert.deepEqual(keys(lot2), keys(sortMediaTitles(filtered, 'focus-priority').slice(0, 50)));
});

test('cambiar un filtro puede traer nuevos títulos al lote porque el ranking se recalcula después', () => {
  const titles = Array.from({ length: 30 }, (_, index) =>
    title(`m${index + 1}`, 'movie', {
      genres: [index < 10 ? 'Drama' : 'Comedia'],
      estimatedAffinity: 10 - index / 20,
    }),
  );
  const originalLot1 = deriveFocusTitles(titles, 'movie', 1);
  const comedies = filterMediaTitles(deriveFocusCandidates(titles, 'movie'), filters('movie', { genre: 'Comedia' }));
  const comedyLot1 = deriveFocusTitles(comedies, 'movie', 1);

  assert.equal(comedyLot1.length, 10);
  assert.ok(comedyLot1.every((item) => item.genres.includes('Comedia')));
  assert.ok(comedyLot1.some((item) => !keys(originalLot1).includes(item.key)));
});

test('Lote manual 1 entra en 1/2/3; manual 2 entra en 2/3; manual 3 sólo en 3', () => {
  const automatic = Array.from({ length: 120 }, (_, index) =>
    title(`m${index + 1}`, 'movie', { estimatedAffinity: 10 - index / 30 }),
  );
  const l1 = title('pin-l1', 'movie', { estimatedAffinity: 0.5, manualFocusLevel: 1 });
  const l2 = title('pin-l2', 'movie', { estimatedAffinity: 0.4, manualFocusLevel: 2 });
  const l3 = title('pin-l3', 'movie', { estimatedAffinity: 0.3, manualFocusLevel: 3 });
  const titles = [...automatic, l1, l2, l3];

  const lot1 = keys(deriveFocusTitles(titles, 'movie', 1));
  const lot2 = keys(deriveFocusTitles(titles, 'movie', 2));
  const lot3 = keys(deriveFocusTitles(titles, 'movie', 3));

  assert.ok(lot1.includes('pin-l1'));
  assert.ok(!lot1.includes('pin-l2'));
  assert.ok(!lot1.includes('pin-l3'));
  assert.ok(lot2.includes('pin-l1') && lot2.includes('pin-l2'));
  assert.ok(!lot2.includes('pin-l3'));
  assert.ok(lot3.includes('pin-l1') && lot3.includes('pin-l2') && lot3.includes('pin-l3'));
});

test('prioridad manual vence el corte automático aunque tenga score bajo', () => {
  const titles = Array.from({ length: 20 }, (_, index) =>
    title(`m${index + 1}`, 'movie', { estimatedAffinity: 10 - index / 20 }),
  );
  const pinned = title('manual-low', 'movie', { estimatedAffinity: 0, manualFocusLevel: 1 });
  const lot1 = deriveFocusTitles([...titles, pinned], 'movie', 1);
  assert.equal(lot1.length, 10);
  assert.ok(keys(lot1).includes('manual-low'));
});

test('los filtros siguen mandando sobre una prioridad manual', () => {
  const pinned = title('old-pin', 'movie', {
    year: 1985,
    manualFocusLevel: 1,
    estimatedAffinity: 9,
  });
  const candidates = deriveFocusCandidates([pinned], 'movie');
  const filtered = filterMediaTitles(candidates, filters('movie', { yearFrom: '1990' }));
  assert.equal(filtered.length, 0);
  assert.equal(deriveFocusTitles(filtered, 'movie', 1).length, 0);
});

test('si hay más prioridades manuales que el cupo base no se descartan decisiones explícitas', () => {
  const pinned = Array.from({ length: 12 }, (_, index) =>
    title(`p${index + 1}`, 'movie', { manualFocusLevel: 1, estimatedAffinity: 5 }),
  );
  assert.equal(deriveFocusTitles(pinned, 'movie', 1).length, 12);
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

test('afinidad estimada y Prioridad de visionado siguen separadas de Nota observada', () => {
  const item = title('separate', 'movie', { rating: 9, estimatedAffinity: 7.4 });
  assert.equal(item.rating, 9);
  assert.equal(item.estimatedAffinity, 7.4);
  assert.notEqual(item.rating, item.estimatedAffinity);
  assert.notEqual(item.rating, watchPriorityScore(item));
});

test('derivar lotes no muta el Banco original', () => {
  const titles = Array.from({ length: 20 }, (_, index) => title(`m${index + 1}`, 'movie'));
  const before = JSON.stringify(titles);
  deriveFocusTitles(titles, 'movie', 2);
  assert.equal(JSON.stringify(titles), before);
});
