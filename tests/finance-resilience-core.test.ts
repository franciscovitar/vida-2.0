import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFinancePlanningSnapshot } from '@/lib/finance/planning-core';
import { buildFinanceResilienceIndicators } from '@/lib/finance/resilience-core';
import type { FinanceCashFlowReport } from '@/lib/finance/reporting/cash-flow-core';

function report(overrides: Partial<FinanceCashFlowReport> = {}): FinanceCashFlowReport {
  return {
    currencies: [],
    monthly: [
      {
        month: '2026-01',
        currency: 'ARS',
        incomeMinor: 100_000,
        expenseMinor: -50_000,
        adjustmentMinor: 0,
        netMinor: 50_000,
        eventCount: 2,
      },
      {
        month: '2026-02',
        currency: 'ARS',
        incomeMinor: 200_000,
        expenseMinor: -80_000,
        adjustmentMinor: 0,
        netMinor: 120_000,
        eventCount: 2,
      },
      {
        month: '2026-03',
        currency: 'ARS',
        incomeMinor: 300_000,
        expenseMinor: -100_000,
        adjustmentMinor: 0,
        netMinor: 200_000,
        eventCount: 2,
      },
    ],
    roleTotals: [
      { role: 'income_work', currency: 'ARS', count: 3, totalMinor: 450_000 },
      { role: 'income_family_support', currency: 'ARS', count: 1, totalMinor: 150_000 },
    ],
    coverage: [],
    transactionCount: 6,
    resolvedTransactions: 6,
    reviewRequiredTransactions: 0,
    unknownRoleTransactions: 0,
    unbalancedTransactions: 0,
    reconciliation: { total: 0, reconciled: 0, partial: 0, conflict: 0, stale: 0 },
    quality: 'ready',
    ...overrides,
  };
}

test('resilience indicators expose earned-income share and monthly income volatility', () => {
  const planning = buildFinancePlanningSnapshot({
    asOf: '2026-10-01',
    currency: 'ARS',
    eligibleLiquidityMinor: 1_000_000,
    essentialMonthlyBurnMinor: 100_000,
    commitments: [
      {
        id: 'reserve',
        label: 'Reserve',
        bucket: 'reserve',
        amountMinor: 200_000,
        currency: 'ARS',
        overlapGroup: null,
      },
    ],
  });

  const indicators = buildFinanceResilienceIndicators(report(), 'ars', planning);

  assert.equal(indicators.currency, 'ARS');
  assert.equal(indicators.observedMonths, 3);
  assert.equal(indicators.earnedIncomeShare, 0.75);
  assert.ok(indicators.monthlyIncomeVolatility !== null);
  assert.ok(Math.abs(indicators.monthlyIncomeVolatility - 0.408248290463863) < 1e-12);
  assert.equal(indicators.reserveCoverageMonths, 2);
  assert.equal(indicators.liquidityCoverageMonths, 10);
  assert.equal(indicators.dataQuality, 'ready');
});

test('resilience indicators stay explicit when history or planning inputs are insufficient', () => {
  const limited = report({
    monthly: [
      {
        month: '2026-01',
        currency: 'ARS',
        incomeMinor: 0,
        expenseMinor: -50_000,
        adjustmentMinor: 0,
        netMinor: -50_000,
        eventCount: 1,
      },
    ],
    roleTotals: [],
    quality: 'attention',
  });

  const indicators = buildFinanceResilienceIndicators(limited, 'ARS', null);

  assert.equal(indicators.observedMonths, 1);
  assert.equal(indicators.earnedIncomeShare, null);
  assert.equal(indicators.monthlyIncomeVolatility, null);
  assert.equal(indicators.reserveCoverageMonths, null);
  assert.equal(indicators.liquidityCoverageMonths, null);
  assert.equal(indicators.dataQuality, 'limited');
});
