import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  EMPTY_CAPABILITY_FILTERS,
  activeHoursLabel,
  capabilityExcerpt,
  capabilitySubcategories,
  filterCapabilities,
  subcategoryLabel,
  genericTimeSummary,
  timeConfidenceLabel,
} from '@/components/learning/capabilities-exploration';

import {
  initialDiscoveries,
  projectCapabilityData,
  validCapabilityDataset,
} from '@/lib/learning/capabilities-model';

const AREAS = [
  'skills',
  'knowledge',
  'resources',
  'character',
  'presence',
  'relationships',
  'experiences',
];
function fixtures() {
  const inventory = { updated: '2030-01-01', items: [] as Record<string, unknown>[] };
  const cards = { items: [] as Record<string, unknown>[] };
  const times = { items: [] as Record<string, unknown>[] };
  const routing = { items: [] as Record<string, unknown>[] };
  for (let index = 1; index <= 245; index += 1) {
    const id = `GC-${String(index).padStart(3, '0')}`;
    const pillar = AREAS[(index - 1) % AREAS.length] ?? 'skills';
    inventory.items.push({
      id,
      name: `Capacidad ${index}`,
      pillar,
      subcategory: 'muestra',
      private_score: 99,
    });
    cards.items.push({
      generalist_item_id: id,
      name: `Capacidad ${index}`,
      status: index <= 12 ? 'CURATED_V1' : 'ON_DEMAND_UNWRITTEN',
      card:
        index <= 12
          ? {
              what_you_get: 'Resultado esperado',
              specific_benefits: ['beneficio de muestra'],
              also_helps_with: [],
              target_feel: 'sensación esperada',
              learning_feel: 'experiencia esperada',
              fine_print: {
                difficulty: 'media',
                friction: 'práctica',
                infrastructure: 'ninguna',
                maintenance: 'ocasional',
              },
              if_never_learned: 'No se convierte en una deuda.',
            }
          : null,
    });
    times.items.push({
      generalist_item_id: id,
      ...(index <= 171
        ? {
            estimate_type: 'LEVEL_ACTIVE_HOURS',
            generic_cumulative_active_hours_from_level_0: {
              '4': { min: 503, max: 907 },
              '2': { min: 29, max: 47 },
              '1': { min: 7, max: 13 },
              '3': { min: 91, max: 137 },
            },
          }
        : {
            estimate_type: 'CALENDAR_AND_REPEATED_BEHAVIOR_NOT_HOURS_ONLY',
            generic_active_hours_to_default_state: null,
            default_target_state: 'CONSISTENT_WHEN_RELEVANT',
          }),
      generic_confidence: 'LOW',
      personalized: { private_value: 42 },
    });
    routing.items.push({
      generalist_item_id: id,
      primary_route: 'GENERALIST_ONLY',
      routes: [
        {
          engine: 'LEARNING_OS',
          role: 'ON_DEMAND',
          trigger: 'ONLY_AFTER_EXPLICIT_LEARNING_OR_PRACTICE_ACTIVATION',
        },
      ],
    });
  }
  return { inventory, cards, times, routing };
}

test('capability dataset validates all 245 synthetic items and exactly 12 complete cards', () => {
  const data = fixtures();
  assert.equal(validCapabilityDataset(data.inventory, data.cards, data.times, data.routing), true);
  data.inventory.items[1]!.id = data.inventory.items[0]!.id;
  assert.equal(validCapabilityDataset(data.inventory, data.cards, data.times, data.routing), false);
});

test('library projects only display fields, exposes no complete card for uncured items, and starts varied', () => {
  const data = fixtures();
  const items = projectCapabilityData(data.inventory, data.cards, data.times, data.routing);
  const initialIds = initialDiscoveries(items);
  const initial = initialIds.map((id) => items.find((item) => item.id === id));
  assert.equal(items.length, 245);
  assert.equal(items.filter((item) => item.status === 'curated').length, 12);
  assert.equal(items.filter((item) => item.card !== null).length, 12);
  assert.equal(new Set(initial.map((item) => item?.area)).size, 3);
  assert.equal(items.find((item) => item.id === 'GC-013')?.card, null);
  assert.equal(items.find((item) => item.id === 'GC-001')?.learningRoute, 'LEARNING_OS');
  assert.equal('private_score' in (items[0] ?? {}), false);
  assert.equal(JSON.stringify(items).includes('private_value'), false);
  assert.deepEqual(Object.keys(items[0] ?? {}).sort(), [
    'area',
    'card',
    'id',
    'learningRoute',
    'name',
    'primaryRoute',
    'status',
    'subcategory',
    'timeConfidence',
    'timeEstimate',
  ]);
});

test('library rejects a curated card that lacks required information', () => {
  const data = fixtures();
  const card = data.cards.items[0]?.card as Record<string, unknown>;
  delete card.if_never_learned;
  assert.equal(validCapabilityDataset(data.inventory, data.cards, data.times, data.routing), false);
});

test('Learning V2 links to the authorized, dynamic capabilities page', () => {
  const hub = readFileSync(join(process.cwd(), 'components/learning/LearningHubV2.tsx'), 'utf8');
  const page = readFileSync(
    join(process.cwd(), 'app/(app)/aprendizaje/capacidades/page.tsx'),
    'utf8',
  );
  assert.match(hub, /href="\/aprendizaje\/capacidades"/);
  assert.match(page, /requireAuthorizedSession\(\)/);
  assert.match(page, /dynamic = 'force-dynamic'/);
});

const require = createRequire(import.meta.url);
const oldScss = require.extensions['.scss'];
require.extensions['.scss'] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_target, key) => (key === '__esModule' ? false : String(key)) },
  );
};
const { CapabilitiesLibrary } =
  require('@/components/learning/CapabilitiesLibrary') as typeof import('@/components/learning/CapabilitiesLibrary');
after(() => {
  if (oldScss) require.extensions['.scss'] = oldScss;
  else delete require.extensions['.scss'];
});

function libraryFixture() {
  const data = fixtures();
  const items = projectCapabilityData(data.inventory, data.cards, data.times, data.routing);
  return {
    status: 'ready' as const,
    items,
    initialIds: initialDiscoveries(items),
    updated: '2030-01-01',
    sourceCommit: 'a'.repeat(40),
    notice: null,
  };
}

test('subcategory options come only from the selected category and retain canonical values', () => {
  const { items } = libraryFixture();
  items[0]!.subcategory = 'expresión_oral';
  items[1]!.subcategory = 'otra_referencia';
  assert.deepEqual(capabilitySubcategories(items, items[0]!.area), ['expresión_oral', 'muestra']);
  assert.equal(capabilitySubcategories(items, '').includes('otra_referencia'), true);
  assert.equal(subcategoryLabel('expresión_oral'), 'Expresión oral');
  assert.equal(items[0]!.subcategory, 'expresión_oral');
});

test('search combines category, subcategory and content across the full inventory, ignoring accents', () => {
  const { items } = libraryFixture();
  const entry = items[100]!;
  entry.name = 'Práctica sintética';
  entry.subcategory = 'expresión_oral';
  const filters = {
    query: 'ORAL practica',
    area: entry.area,
    subcategory: entry.subcategory,
    content: 'discovery' as const,
  };
  assert.deepEqual(filterCapabilities(items, filters), [entry]);
  assert.deepEqual(filterCapabilities(items, { ...filters, content: 'curated' }), []);
  assert.deepEqual(filterCapabilities(items, { ...filters, area: 'Área inexistente' }), []);
  assert.equal(
    filterCapabilities(items, { ...EMPTY_CAPABILITY_FILTERS, content: 'curated' }).length,
    12,
  );
  assert.equal(filterCapabilities(items, EMPTY_CAPABILITY_FILTERS).length, 245);
  assert.deepEqual(
    filterCapabilities(items, {
      ...EMPTY_CAPABILITY_FILTERS,
      query: 'sin coincidencias sintéticas',
    }),
    [],
  );
});

test('compact descriptions use existing content without truncating the underlying card', () => {
  const { items } = libraryFixture();
  const item = items[0]!;
  assert.equal(capabilityExcerpt(item), item.card!.whatYouGet);
  item.card!.whatYouGet = 'Una descripción sintética con palabras. '.repeat(30);
  const original = item.card!.whatYouGet;
  assert.equal(capabilityExcerpt(item).endsWith('…'), true);
  assert.ok(capabilityExcerpt(item).length <= 151);
  assert.equal(item.card!.whatYouGet, original);
  assert.equal(
    capabilityExcerpt(items[20]!).includes(subcategoryLabel(items[20]!.subcategory)),
    true,
  );
});

test('initial view renders just three collapsed discoveries with filters first and no opportunity debt', () => {
  const html = renderToStaticMarkup(
    createElement(CapabilitiesLibrary, { library: libraryFixture() }),
  );
  assert.equal((html.match(/<article/g) ?? []).length, 3);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 3);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 8);
  assert.ok(html.indexOf('Buscar capacidades') < html.indexOf('Tres descubrimientos'));
  assert.match(html, /Subcategoría/);
  assert.match(html, /Explorar todo el inventario/);
  assert.match(html, /Ficha curada/);
  assert.match(html, /2030-01-01/);
  assert.doesNotMatch(html, /<h4|Si nunca lo aprendés|Fricciones habituales/);
  assert.doesNotMatch(
    html,
    /aún sin|todavía|pendientes|por completar|[0-9]+%|private_score|private_value/,
  );
});

test('unavailable library retains its generic notice without surfacing controls or data', () => {
  const library = {
    ...libraryFixture(),
    status: 'unavailable' as const,
    items: [],
    initialIds: [],
    notice: 'Biblioteca no disponible.',
  };
  const html = renderToStaticMarkup(createElement(CapabilitiesLibrary, { library }));
  assert.match(html, /role="status"/);
  assert.match(html, /Biblioteca no disponible/);
  assert.doesNotMatch(html, /<article|<input|PAS main/);
});

test('structured level estimates keep units, numeric level order and confidence without personalized fields', () => {
  const data = fixtures();
  const items = projectCapabilityData(data.inventory, data.cards, data.times, data.routing);
  assert.equal(items.filter((item) => item.timeEstimate.levelRanges.length === 4).length, 171);
  assert.equal(items.filter((item) => item.timeEstimate.levelRanges.length === 0).length, 74);
  const item = items[20]!;
  assert.equal(item.timeEstimate.unit, 'active_hours');
  assert.deepEqual(item.timeEstimate.levelRanges, [
    { level: 1, min: 7, max: 13 },
    { level: 2, min: 29, max: 47 },
    { level: 3, min: 91, max: 137 },
    { level: 4, min: 503, max: 907 },
  ]);
  assert.match(item.timeEstimate.criterion!, /acumuladas desde el nivel 0/);
  assert.match(genericTimeSummary(item), /Nivel 1: 7–13 horas activas/);
  assert.equal(timeConfidenceLabel(item), 'Confianza baja');
  assert.doesNotMatch(JSON.stringify(items), /private_value|personalized|remaining|genericHours/);
});

test('level estimates preserve exposure and ongoing refresh rather than reducing their models to hours', () => {
  for (const [model, label] of [
    ['LEVEL_ACTIVE_HOURS_PLUS_REAL_EXPOSURE', 'exposición real'],
    ['LEVEL_ACTIVE_HOURS_PLUS_EXPOSURE', 'exposición'],
    ['LEVEL_ACTIVE_HOURS_PLUS_ONGOING_REFRESH', 'actualización continua'],
  ]) {
    const data = fixtures();
    data.times.items[20]!.estimate_type = model;
    data.times.items[20]!.generic_confidence = 'MEDIUM';
    const item = projectCapabilityData(data.inventory, data.cards, data.times, data.routing)[20]!;
    assert.match(genericTimeSummary(item), new RegExp(label!));
    assert.equal(item.timeEstimate.levelRanges.length, 4);
    assert.equal(timeConfidenceLabel(item), 'Confianza media');
  }
});

test('non-hour-only models explain their actual criterion without inventing quantities or unavailable hours', () => {
  const models = [
    ['CALENDAR_AND_REPEATED_BEHAVIOR_NOT_HOURS_ONLY', 'repetición de conductas'],
    ['EVENT_OR_EXPOSURE_NOT_HOURS_ONLY', 'experiencia o exposición'],
    ['CALENDAR_AND_RELATIONSHIP_QUALITY_NOT_HOURS_ONLY', 'calidad y continuidad'],
    ['MIXED_ACTIVE_HOURS_AND_CONTEXTUAL_CONSISTENCY', 'consistencia en distintos contextos'],
    ['STATE_AND_RESILIENCE_NOT_HOURS_ONLY', 'estado del recurso y su resiliencia'],
  ];
  for (const [model, criterion] of models) {
    const data = fixtures();
    data.times.items[171]!.estimate_type = model;
    const item = projectCapabilityData(data.inventory, data.cards, data.times, data.routing)[171]!;
    assert.match(item.timeEstimate.criterion!, new RegExp(criterion!));
    assert.deepEqual(item.timeEstimate.levelRanges, []);
    assert.equal(item.timeEstimate.unit, null);
    assert.equal(item.timeEstimate.stateRange, null);
    const excerpt = capabilityExcerpt(item);
    assert.doesNotMatch(excerpt, /no disponible|Sin estimación|\d|Del inventario/);
    assert.match(excerpt, /Confianza baja/);
  }
});

test('mixed state models retain their hour ranges as secondary references alongside the real-world criterion', () => {
  for (const model of [
    'ACTIVE_HOURS_PLUS_REAL_WORLD_REPETITION',
    'ACTIVE_HOURS_TO_FUNCTIONAL_STATE_PLUS_REFRESH',
  ]) {
    const data = fixtures();
    data.times.items[171] = {
      ...data.times.items[171],
      estimate_type: model,
      generic_active_hours_to_default_state: { min: 17, max: 31 },
      default_target_state: 'SUFFICIENT_WITH_MARGIN',
    };
    const item = projectCapabilityData(data.inventory, data.cards, data.times, data.routing)[171]!;
    assert.deepEqual(item.timeEstimate.levelRanges, []);
    assert.deepEqual(item.timeEstimate.stateRange, { min: 17, max: 31 });
    assert.match(genericTimeSummary(item), /17–31 horas activas/);
    assert.match(
      item.timeEstimate.criterion!,
      /repetición en situaciones reales|actualización posterior/,
    );
    assert.equal(item.timeEstimate.stateLabel, 'Suficiencia con margen');
  }
});

test('invalid, absent and unknown time data stay unavailable instead of becoming zero or medium confidence', () => {
  const data = fixtures();
  data.times.items[20] = {
    ...data.times.items[20],
    estimate_type: 'constructor',
    default_target_state: 'toString',
    generic_confidence: 'UNREVIEWED',
    generic_cumulative_active_hours_from_level_0: {
      '1': { min: '7', max: 13 },
      '2': { min: -1, max: 2 },
      '3': { min: 12, max: 3 },
      '4': { min: 2, max: Infinity },
      metadata: { min: 0, max: 1 },
    },
    generic_active_hours_to_default_state: { min: 1, max: null },
  };
  let item = projectCapabilityData(data.inventory, data.cards, data.times, data.routing)[20]!;
  assert.deepEqual(item.timeEstimate, {
    unit: null,
    levelRanges: [],
    stateRange: null,
    modelLabel: null,
    criterion: null,
    stateLabel: null,
  });
  assert.equal(timeConfidenceLabel(item), 'Confianza no indicada');
  assert.equal(genericTimeSummary(item), 'Referencia de esfuerzo no disponible');
  data.times.items[20]!.generic_cumulative_active_hours_from_level_0 = { '1': { min: 0, max: 0 } };
  item = projectCapabilityData(data.inventory, data.cards, data.times, data.routing)[20]!;
  assert.equal(activeHoursLabel(item.timeEstimate.levelRanges[0]!), '0 horas activas');
});

test('Spanish subcategory labels remain searchable without changing filter values or curated card content', () => {
  const data = fixtures();
  const before = projectCapabilityData(data.inventory, data.cards, data.times, data.routing);
  data.inventory.items[20]!.subcategory = 'learning';
  data.times.items[20]!.generic_confidence = 'HIGH';
  const items = projectCapabilityData(data.inventory, data.cards, data.times, data.routing);
  assert.equal(subcategoryLabel('learning'), 'Aprendizaje');
  assert.equal(subcategoryLabel('body_language'), 'Lenguaje corporal');
  assert.equal(subcategoryLabel('knowledge'), 'Knowledge'); // unknown taxonomy is not invented
  assert.equal(items[20]!.subcategory, 'learning');
  assert.deepEqual(filterCapabilities(items, { ...EMPTY_CAPABILITY_FILTERS, query: 'learning' }), [
    items[20],
  ]);
  assert.deepEqual(
    filterCapabilities(items, {
      ...EMPTY_CAPABILITY_FILTERS,
      query: 'aprendizaje',
      subcategory: 'learning',
    }),
    [items[20]],
  );
  assert.deepEqual(
    items.map((item) => item.card),
    before.map((item) => item.card),
  );
  const library = { ...libraryFixture(), items, initialIds: [items[20]!.id, items[171]!.id] };
  const html = renderToStaticMarkup(createElement(CapabilitiesLibrary, { library }));
  assert.match(
    html,
    /Aprendizaje · Horas activas por nivel · Nivel 1: 7–13 horas activas · Confianza alta/,
  );
  assert.match(html, /Conducta repetida a lo largo del tiempo/);
  assert.doesNotMatch(html, /Del inventario|Sin estimación disponible|Learning/);
});
