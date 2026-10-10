import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canCompareVisualMetrics,
  isVisualSourceReviewDue,
  parseProfessionalVisualizationSnapshot,
  type VisualMetric,
  type VisualSource,
} from '../lib/professional/visualization-contract';

const growth: VisualMetric = {
  id: 'growth-software',
  label: 'Software developers',
  kind: 'EMPLOYMENT_GROWTH_PERCENT',
  value: 10.2,
  unit: 'PERCENT',
  geography: 'US_BENCHMARK',
  horizon: 'OFFICIAL_2025_2035',
  period: '2025-2035',
  roleId: 'software-developer',
  occupationCode: '15-1252',
  seniority: null,
  dollarized: null,
  sampleSize: null,
  sourceId: 'BLS',
};

const salary: VisualMetric = {
  id: 'salary-software',
  label: 'Desarrollo junior',
  kind: 'MEDIAN_GROSS_MONTHLY_SALARY',
  value: 1_538_500,
  unit: 'ARS_GROSS_MONTHLY',
  geography: 'ARGENTINA_LOCAL',
  horizon: 'HISTORICAL_SURVEY',
  period: '2025-12/2026-02',
  roleId: 'developer',
  occupationCode: null,
  seniority: 'Junior',
  dollarized: false,
  sampleSize: 148,
  sourceId: 'SYSARMY',
};

function snapshot() {
  return {
    schemaVersion: 1,
    kind: 'professional_visualization_snapshot',
    source: {
      repository: 'franciscovitar/personal-ai-system',
      ref: 'main',
      commit: 'a'.repeat(40),
      canonicalRefs: ['AI/projects/professional-intelligence/LABOR_MARKET_CURRENT_V1.json'],
      generatedAt: '2026-10-10',
    },
    sources: [
      {
        id: 'BLS',
        label: 'BLS',
        url: 'https://www.bls.gov',
        observedAt: '2026-09-18',
        reviewAfterDays: 400,
        kind: 'OFFICIAL_STATISTICS',
      },
      {
        id: 'SYSARMY',
        label: 'Sysarmy',
        url: 'https://sueldos.openqube.io',
        observedAt: '2026-02-28',
        reviewAfterDays: 90,
        kind: 'WORKFORCE_SURVEY',
      },
    ],
    panels: [
      { id: 'V02', state: 'AVAILABLE', reason: null, metrics: [growth] },
      {
        id: 'V03',
        state: 'INSUFFICIENT_EVIDENCE',
        reason: 'Need counterpart metric',
        metrics: [],
      },
      {
        id: 'V04',
        state: 'PARTIAL_COMPARISON',
        reason: 'Historical salary only',
        metrics: [salary],
      },
    ],
  };
}

test('PRO-VIZ-00 valid grounded structure', () => {
  assert.ok(parseProfessionalVisualizationSnapshot(snapshot()));
});

test('PRO-VIZ-01 percentages are not job counts', () => {
  const jobs: VisualMetric = {
    ...growth,
    kind: 'NET_NEW_JOBS',
    unit: 'JOBS',
    value: 174_800,
  };
  assert.equal(canCompareVisualMetrics(growth, jobs), false);
});

test('PRO-VIZ-02 no US projection presented as Argentina demand', () => {
  const data = snapshot();
  data.panels[0].metrics[0] = { ...growth, geography: 'ARGENTINA_LOCAL' };
  assert.equal(parseProfessionalVisualizationSnapshot(data), null);
});

test('PRO-VIZ-03 salary seniority and dollarization remain separate', () => {
  assert.equal(canCompareVisualMetrics(salary, { ...salary, seniority: 'Senior' }), false);
  assert.equal(canCompareVisualMetrics(salary, { ...salary, dollarized: true }), false);
});

test('PRO-VIZ-04 survey median requires sample size', () => {
  const data = snapshot();
  data.panels[2].metrics[0] = { ...salary, sampleSize: null };
  assert.equal(parseProfessionalVisualizationSnapshot(data), null);
});

test('PRO-VIZ-05 metric must point to a known source', () => {
  const data = snapshot();
  data.panels[0].metrics[0] = { ...growth, sourceId: 'UNKNOWN' };
  assert.equal(parseProfessionalVisualizationSnapshot(data), null);
});

test('PRO-VIZ-06 reject invented job loss probabilities', () => {
  const data = snapshot();
  data.panels[0].metrics[0] = {
    ...growth,
    kind: 'AI_REPLACEMENT_PROBABILITY' as VisualMetric['kind'],
  };
  assert.equal(parseProfessionalVisualizationSnapshot(data), null);
});

test('PRO-VIZ-07 empty charts and unexplained unavailable states are invalid', () => {
  const empty = snapshot();
  empty.panels[0].metrics = [];
  assert.equal(parseProfessionalVisualizationSnapshot(empty), null);

  const unexplained = snapshot();
  unexplained.panels[1].reason = null;
  assert.equal(parseProfessionalVisualizationSnapshot(unexplained), null);
});

test('PRO-VIZ-08 duplicate panels fail closed', () => {
  const data = snapshot();
  data.panels.push({ ...data.panels[0] });
  assert.equal(parseProfessionalVisualizationSnapshot(data), null);
});

test('PRO-VIZ-09 comparisons require matching periods and methodologies', () => {
  assert.equal(canCompareVisualMetrics(growth, { ...growth, period: '2024-2034' }), false);
  assert.equal(canCompareVisualMetrics(growth, { ...growth, sourceId: 'ALT' }), false);
});

test('PRO-VIZ-10 canonical source must not be renamed', () => {
  const data = snapshot();
  data.source.repository = 'unknown/source';
  assert.equal(parseProfessionalVisualizationSnapshot(data), null);
});

test('PRO-VIZ-11 historical salary review is due but official projection is not', () => {
  const data = snapshot();
  const survey = data.sources[1] as VisualSource;
  const official = data.sources[0] as VisualSource;
  assert.equal(isVisualSourceReviewDue(survey, new Date('2026-10-10')), true);
  assert.equal(isVisualSourceReviewDue(official, new Date('2026-10-10')), false);
});

test('PRO-VIZ-12 impossible dates and future observations fail closed', () => {
  const data = snapshot();
  data.sources[0].observedAt = '2026-02-30';
  assert.equal(parseProfessionalVisualizationSnapshot(data), null);
  const official = snapshot().sources[0] as VisualSource;
  assert.equal(isVisualSourceReviewDue(official, new Date('2026-02-10')), true);
});
