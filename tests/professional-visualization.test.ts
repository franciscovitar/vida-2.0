import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canCompareVisualMetrics,
  isVisualSourceReviewDue,
  parseProfessionalVisualizationSnapshot,
  type VisualMetric,
} from '../lib/professional/visualization-contract';

const bls: VisualMetric = {
  id: 'growth-software', label: 'Software developers',
  kind: 'EMPLOYMENT_GROWTH_PERCENT', value: 10.2, unit: 'PERCENT',
  geography: 'US_BENCHMARK', horizon: 'OFFICIAL_2025_2035', period: '2025-2035',
  roleId: 'software-developer', occupationCode: '15-1252', seniority: null,
  dollarized: null, sampleSize: null, sourceId: 'BLS',
};
const salary: VisualMetric = {
  id: 'salary-software', label: 'Desarrollo junior',
  kind: 'MEDIAN_GROSS_MONTHLY_SALARY', value: 1_538_500, unit: 'ARS_GROSS_MONTHLY',
  geography: 'ARGENTINA_LOCAL', horizon: 'HISTORICAL_SURVEY', period: '2025-12/2026-02',
  roleId: 'developer', occupationCode: null, seniority: 'Junior',
  dollarized: false, sampleSize: 148, sourceId: 'SYSARMY',
};
function validFixture() {
  return {
    schemaVersion: 1, kind: 'professional_visualization_snapshot',
    source: {
      repository: 'franciscovitar/personal-ai-system', ref: 'main',
      commit: 'a'.repeat(40),
      canonicalRefs: ['AI/projects/professional-intelligence/LABOR_MARKET_CURRENT_V1.json'],
      generatedAt: '2026-10-10',
    },
    sources: [
      { id: 'BLS', label: 'BLS', url: 'https://www.bls.gov', observedAt: '2026-09-18', reviewAfterDays: 400, kind: 'OFFICIAL_STATISTICS' },
      { id: 'SYSARMY', label: 'Sysarmy', url: 'https://sueldos.openqube.io', observedAt: '2026-02-28', reviewAfterDays: 90, kind: 'WORKFORCE_SURVEY' },
    ],
    panels: [
      { id: 'V02', state: 'AVAILABLE', reason: null, metrics: [bls] },
      { id: 'V03', state: 'INSUFFICIENT_EVIDENCE', reason: 'Need counterpart metric', metrics: [] },
      { id: 'V04', state: 'PARTIAL_COMPARISON', reason: 'Historical salary only', metrics: [salary] },
    ],
  };
}
const mutated = (fn: (v: ReturnType<typeof validFixture>) => void) => {
  const v = validFixture(); fn(v); return v;
};

test('PRO-VIZ-00 valid grounded structure and honest partial state', () => {
  assert.ok(parseProfessionalVisualizationSnapshot(validFixture()));
});
test('PRO-VIZ-01 no percentages vs job-count equivalence', () => {
  assert.equal(canCompareVisualMetrics(bls, { ...bls, id: 'jobs', kind: 'NET_NEW_JOBS', unit: 'JOBS', value: 174800 }), false);
});
test('PRO-VIZ-02 US projection cannot be represented as Argentina demand', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.panels[0].metrics[0] = { ...bls, geography: 'ARGENTINA_LOCAL' };
  })), null);
});
test('PRO-VIZ-03 salary cohorts and dollarization must not mix', () => {
  assert.equal(canCompareVisualMetrics(salary, { ...salary, seniority: 'Senior' }), false);
  assert.equal(canCompareVisualMetrics(salary, { ...salary, dollarized: true }), false);
});
test('PRO-VIZ-04 survey medians must have sample and explicit seniority', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.panels[2].metrics[0] = { ...salary, sampleSize: null };
  })), null);
});
test('PRO-VIZ-05 reject untracked source IDs', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.panels[0].metrics[0] = { ...bls, sourceId: 'UNKNOWN' };
  })), null);
});
test('PRO-VIZ-06 reject unsupported job-loss probabilities or other made-up metrics', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.panels[0].metrics[0] = { ...bls, kind: 'AI_REPLACEMENT_PROBABILITY' as VisualMetric['kind'] };
  })), null);
});
test('PRO-VIZ-07 no empty charts without a reason', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.panels[0].metrics = [];
  })), null);
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.panels[1].reason = null as unknown as string;
  })), null);
});
test('PRO-VIZ-08 duplicated panels or metrics fail closed', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.panels.push({ ...x.panels[0] });
  })), null);
});
test('PRO-VIZ-09 periods and methods must match for comparison', () => {
  assert.equal(canCompareVisualMetrics(bls, { ...bls, period: '2024-2034' }), false);
  assert.equal(canCompareVisualMetrics(bls, { ...bls, sourceId: 'ALT' }), false);
});
test('PRO-VIZ-10 never silently rename the data source', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.source.repository = 'unknown/source';
  })), null);
});
test('PRO-VIZ-11 historic compensation review becomes due, but official dataset remains valid', () => {
  const v = validFixture();
  assert.equal(isVisualSourceReviewDue(v.sources[1] as Parameters<typeof isVisualSourceReviewDue>[0], new Date('2026-10-10')), true);
  assert.equal(isVisualSourceReviewDue(v.sources[0] as Parameters<typeof isVisualSourceReviewDue>[0], new Date('2026-10-10')), false);
});
test('PRO-VIZ-12 stale or impossible future dates cannot masquerade as verified', () => {
  assert.equal(parseProfessionalVisualizationSnapshot(mutated((x) => {
    x.sources[0].observedAt = '2026-02-30';
  })), null);
  const s = validFixture().sources[0] as Parameters<typeof isVisualSourceReviewDue>[0];
  assert.equal(isVisualSourceReviewDue(s, new Date('2026-02-10')), true);
});
