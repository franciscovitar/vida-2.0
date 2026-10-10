import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  canCompareVisualMetrics,
  parseProfessionalVisualizationSnapshot,
  type VisualMetric,
} from '@/lib/professional/visualization-contract';

const raw = readFileSync(
  join(process.cwd(), 'data', 'generated', 'professional-visualization.json'),
  'utf8',
);

function snapshot() {
  const result = parseProfessionalVisualizationSnapshot(JSON.parse(raw));
  assert.ok(result, 'PAS-derived visualization source must validate');
  return result;
}

test('PRO-A-01: 24 grounded observations across eight distinct US occupations', () => {
  const parsed = snapshot();
  const p2 = parsed.panels.find((panel) => panel.id === 'V02');
  const p3 = parsed.panels.find((panel) => panel.id === 'V03');
  assert.equal(p2?.state, 'AVAILABLE');
  assert.equal(p2?.metrics.length, 16);
  assert.equal(p3?.metrics.length, 8);
  assert.equal(parsed.sources[0].id, 'LM-SRC-001');
  assert.equal(parsed.source.commit, '08ae01c509111438cb77f0f9582b9966013ae4a2');
  assert.equal(parsed.source.canonicalRefs.length, 1);
  assert.equal(parsed.sources[0].observedAt, '2026-09-18');
  assert.equal(new Set(p3?.metrics.map((metric) => metric.occupationCode)).size, 8);
});

test('PRO-A-02: projected increase never passes as total current openings', () => {
  const parsed = snapshot();
  const p2 = parsed.panels.find((panel) => panel.id === 'V02');
  const p3 = parsed.panels.find((panel) => panel.id === 'V03');
  assert.ok(p2 && p3);
  const swNet = p2.metrics.find(
    (metric) => metric.occupationCode === '15-1252' && metric.kind === 'NET_NEW_JOBS',
  );
  const swAnnual = p3.metrics.find((metric) => metric.occupationCode === '15-1252');
  assert.ok(swNet && swAnnual);
  assert.equal(swNet.value, 174800);
  assert.equal(swAnnual.value, 95300);
  assert.equal(canCompareVisualMetrics(swNet, swAnnual), false);
});

test('PRO-A-03: official US occupational percentages remain different from net positions', () => {
  const parsed = snapshot();
  const metric = (code: string, kind: string) => {
    const result = parsed.panels
      .flatMap((panel) => panel.metrics)
      .find((item) => item.occupationCode === code && item.kind === kind);
    assert.ok(result);
    return result.value;
  };
  assert.equal(metric('15-2051', 'EMPLOYMENT_GROWTH_PERCENT'), 34.6);
  assert.equal(metric('15-2051', 'NET_NEW_JOBS'), 95400);
  assert.equal(metric('15-1212', 'EMPLOYMENT_GROWTH_PERCENT'), 21);
  assert.equal(metric('15-1212', 'NET_NEW_JOBS'), 40500);
});

test('PRO-A-04: sampled salaries and job loss probabilities are not fabricated', () => {
  const parsed = snapshot();
  const metrics = parsed.panels.flatMap((panel) => panel.metrics);
  assert.equal(
    metrics.some((item) => item.geography !== 'US_BENCHMARK'),
    false,
  );
  assert.equal(
    metrics.some((item) => item.kind === 'MEDIAN_GROSS_MONTHLY_SALARY'),
    false,
  );
  assert.equal(parsed.panels.find((item) => item.id === 'V04')?.state, 'INSUFFICIENT_EVIDENCE');
});

test('PRO-A-05: malformed and mixed-source metrics fail closed', () => {
  const broken = JSON.parse(raw);
  broken.panels[0].metrics[0].geography = 'ARGENTINA_LOCAL';
  assert.equal(parseProfessionalVisualizationSnapshot(broken), null);
  const missing = JSON.parse(raw);
  missing.sources = [];
  assert.equal(parseProfessionalVisualizationSnapshot(missing), null);
  const manipulated = JSON.parse(raw);
  manipulated.panels[1].metrics[0].kind = 'AI_REPLACEMENT_PROBABILITY' as VisualMetric['kind'];
  assert.equal(parseProfessionalVisualizationSnapshot(manipulated), null);
});
