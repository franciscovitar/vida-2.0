import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  eligibleToolOffers,
  modelAccessLabel,
  representativeToolOffers,
  resolveToolTask,
  TOOL_TASKS,
} from '@/lib/professional/tool-task-comparison';
import type { ProfessionalOfferVariantsSnapshot } from '@/types/professional-offers';

const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), 'data/generated/professional-offer-variants.json'), 'utf8'),
) as ProfessionalOfferVariantsSnapshot;
const allowedIds = snapshot.comparisonGroups[0]?.offerIds ?? [];

test('PRO-TOOLS-V09-01. tareas estables y selección desconocida sin romper navegación', () => {
  assert.equal(TOOL_TASKS.length, 8);
  assert.equal(new Set(TOOL_TASKS.map((task) => task.id)).size, 8);
  assert.equal(resolveToolTask('backend').label, 'Backend y APIs');
  assert.equal(TOOL_TASKS[0]?.id, 'coding');
  assert.equal(resolveToolTask('__unknown__'), TOOL_TASKS[0]);
});

test('PRO-TOOLS-V09-02. filtra por canal y presupuesto sin inventar eficacia', () => {
  const backend = eligibleToolOffers(
    snapshot.offers,
    allowedIds,
    resolveToolTask('backend'),
    'all',
  );
  assert.ok(backend.length > 0);
  assert.ok(
    backend.every((offer) =>
      offer.channels.some((channel) => resolveToolTask('backend').channels.includes(channel)),
    ),
  );

  const free = eligibleToolOffers(snapshot.offers, allowedIds, resolveToolTask('backend'), 'free');
  assert.ok(free.length > 0);
  assert.ok(free.every((offer) => offer.headlinePriceUsdMonthly === 0));
  assert.ok(free.every((offer) => offer.keyLimit.length >= 20));

  const under20 = eligibleToolOffers(
    snapshot.offers,
    allowedIds,
    resolveToolTask('research'),
    'under20',
  );
  assert.ok(under20.every((offer) => offer.headlinePriceUsdMonthly <= 20));
  assert.ok(
    under20.every((offer) => offer.channels.includes('APP') || offer.channels.includes('WORK')),
  );
});

test('PRO-TOOLS-V09-03. un plan representativo por producto no es un ranking', () => {
  const all = eligibleToolOffers(snapshot.offers, allowedIds, resolveToolTask('coding'), 'all');
  const representatives = representativeToolOffers(all, 'all');
  const uniqueProducts = representatives.map((offer) => `${offer.provider}::${offer.product}`);
  assert.equal(new Set(uniqueProducts).size, representatives.length);
  assert.ok(representatives.length <= all.length);
  assert.ok(representatives.every((offer) => all.some((candidate) => candidate.id === offer.id)));
  assert.ok(representatives.length >= 3 && representatives.length <= 5);
  const products = representatives.map((offer) => offer.product);
  assert.deepEqual(
    products,
    [...products].sort((a, b) => a.localeCompare(b, 'es')),
  );
  assert.equal(snapshot.comparisonGroups[0]?.rankingStatus, 'COMPARISON_ONLY');
});

test('PRO-TOOLS-V09-05. las 14 ofertas siguen accesibles entre tareas y catálogo completo', () => {
  assert.equal(snapshot.offers.length, 14);
  const reachable = new Set(
    TOOL_TASKS.flatMap((task) =>
      eligibleToolOffers(snapshot.offers, allowedIds, task, 'all').map((offer) => offer.id),
    ),
  );
  assert.equal(reachable.size, 14);
  const tools = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalTools.tsx'),
    'utf8',
  );
  assert.match(tools, /snapshot\.offers\.map\(\(offer\) => \(\s*<OfferRow/);
});

test('PRO-TOOLS-V09-04. conserva fuente de modelos y no inventa una versión ausente', () => {
  for (const offer of snapshot.offers) {
    assert.ok(modelAccessLabel(offer).length > 10);
  }
  assert.match(
    modelAccessLabel(snapshot.offers.find((offer) => offer.id === 'claude-pro')!),
    /fuente|modelos/i,
  );
  const tools = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalTools.tsx'),
    'utf8',
  );
  assert.match(tools, /V09\s+\(calidad por tarea\)\s+y\s+V10\s+\(costo por resultado útil\)/);
  assert.match(tools, /No hay un mejor modelo verificado|no hay un mejor modelo verificado/i);
  assert.doesNotMatch(tools, /qualityScore|performanceScore|winnerModel/);
});
