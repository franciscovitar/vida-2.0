import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

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
      generic_cumulative_active_hours_from_level_0: ['1', '2'],
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
    'genericHours',
    'id',
    'learningRoute',
    'name',
    'primaryRoute',
    'status',
    'subcategory',
    'timeConfidence',
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
