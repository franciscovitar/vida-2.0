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
  assert.match(tools, /V09\s+\(calidad por\s+tarea\)\s+y\s+V10\s+\(costo por resultado útil\)/);
  assert.match(tools, /No hay un mejor modelo verificado|no hay un mejor modelo verificado/i);
  assert.doesNotMatch(tools, /qualityScore|performanceScore|winnerModel/);
});

test('PRO-TOOLS-V09-06. métricas observadas corresponden a la edición y categoría', async () => {
  const { benchmarkForTask } = await import('@/lib/professional/tool-benchmarks');
  const coding = benchmarkForTask('coding', new Date('2026-10-11T12:00:00Z'));
  const backend = benchmarkForTask('backend', new Date('2026-10-11T12:00:00Z'));
  const data = benchmarkForTask('data', new Date('2026-10-11T12:00:00Z'));
  assert.equal(coding.valid, true);
  assert.equal(coding.match.applicability, 'DIRECT_CATEGORY');
  assert.equal(backend.match.applicability, 'PROXY');
  assert.equal(data.match.metric, 'dataAnalysis');
  assert.equal(coding.source.release, '2026-06-25');
  assert.equal(coding.source.observedAt, '2026-10-11');
  assert.equal(new Set(coding.rows.map((item) => item.id)).size, 8);
  assert.equal(coding.rows.length, 8);
  assert.ok(coding.rows.every((item) => item.score >= 0 && item.score <= 100));
  assert.ok(coding.rows.every((item, i) => i === 0 || coding.rows[i - 1]!.score >= item.score));
  assert.equal(
    coding.rows.find((item) => item.id === 'claude-opus-55')?.score,
    89.3,
  );
  assert.equal(
    backend.rows.find((item) => item.id === 'deepseek-v41-flash')?.score,
    77.3,
  );
  assert.equal(
    data.rows.find((item) => item.id === 'gpt-6-astra')?.score,
    83,
  );
});

test('PRO-TOOLS-V09-07. no inventa navegador ni confunde precios con benchmarks', async () => {
  const { benchmarkForTask } = await import('@/lib/professional/tool-benchmarks');
  const browser = benchmarkForTask('browser', new Date('2026-10-11T12:00:00Z'));
  assert.equal(browser.match.applicability, 'UNAVAILABLE');
  assert.equal(browser.rows.length, 0);
  const old = benchmarkForTask('coding', new Date('2027-01-01T12:00:00Z'));
  assert.equal(old.stale, true);
  assert.equal(old.rows.length, 8); // historical evidence stays readable
  const benchView = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalToolBenchmark.tsx'),
    'utf8',
  );
  assert.match(benchView, /resultados del benchmark|resultados de modelos|Resultados publicados/i);
  assert.match(benchView, /no planes de ChatGPT/);
  assert.doesNotMatch(benchView, /ganador universal|mejor para tu proyecto/i);
  const tools = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalTools.tsx'),
    'utf8',
  );
  assert.match(tools, /<ProfessionalToolBenchmark taskId={task.id}/);
  assert.match(tools, /data\.status !== 'ready' \|\| !data\.snapshot \|\| data\.stale/);
});
