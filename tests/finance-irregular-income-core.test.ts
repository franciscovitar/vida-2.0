import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFinanceIrregularIncomeProfile,
  evaluateFinanceSurvivalScenario,
} from '@/lib/finance/irregular-income-core';
import type { FinanceCashFlowReport } from '@/lib/finance/reporting/cash-flow-core';

function report(): FinanceCashFlowReport {
  return {
    currencies: [],
    monthly: [
      {
        month: '2026-01',
        currency: 'ARS',
        incomeMinor: 300_000,
        expenseMinor: -500_000,
        adjustmentMinor: 0,
        netMinor: -200_000,
        eventCount: 4,
      },
      {
        month: '2026-02',
        currency: 'ARS',
        incomeMinor: 600_000,
        expenseMinor: -550_000,
        adjustmentMinor: 0,
        netMinor: 50_000,
        eventCount: 4,
      },
      {
        month: '2026-03',
        currency: 'ARS',
        incomeMinor: 400_000,
        expenseMinor: -450_000,
        adjustmentMinor: 0,
        netMinor: -50_000,
        eventCount: 4,
      },
    ],
    roleTotals: [],
    monthlyRoleTotals: [
      {
        month: '2026-01',
        currency: 'ARS',
        role: 'income_family_support',
        count: 1,
        totalMinor: 200_000,
      },
      { month: '2026-01', currency: 'ARS', role: 'income_work', count: 1, totalMinor: 100_000 },
      {
        month: '2026-01',
        currency: 'ARS',
        role: 'expense_personal',
        count: 1,
        totalMinor: -470_000,
      },
      {
        month: '2026-01',
        currency: 'ARS',
        role: 'expense_professional',
        count: 1,
        totalMinor: -30_000,
      },
      {
        month: '2026-02',
        currency: 'ARS',
        role: 'income_family_support',
        count: 1,
        totalMinor: 200_000,
      },
      { month: '2026-02', currency: 'ARS', role: 'income_work', count: 1, totalMinor: 400_000 },
      {
        month: '2026-02',
        currency: 'ARS',
        role: 'expense_personal',
        count: 1,
        totalMinor: -520_000,
      },
      {
        month: '2026-02',
        currency: 'ARS',
        role: 'expense_professional',
        count: 1,
        totalMinor: -30_000,
      },
      {
        month: '2026-03',
        currency: 'ARS',
        role: 'income_family_support',
        count: 1,
        totalMinor: 200_000,
      },
      { month: '2026-03', currency: 'ARS', role: 'income_work', count: 1, totalMinor: 200_000 },
      {
        month: '2026-03',
        currency: 'ARS',
        role: 'expense_personal',
        count: 1,
        totalMinor: -420_000,
      },
      {
        month: '2026-03',
        currency: 'ARS',
        role: 'expense_professional',
        count: 1,
        totalMinor: -30_000,
      },
    ],
    coverage: [
      {
        accountId: 'naranja',
        displayName: 'Naranja',
        currency: 'ARS',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        batchCount: 3,
        sourceRowCount: 1,
      },
      {
        accountId: 'mp',
        displayName: 'MP',
        currency: 'ARS',
        periodStart: '2026-01-01',
        periodEnd: '2026-02-28',
        batchCount: 2,
        sourceRowCount: 1,
      },
    ],
    transactionCount: 12,
    resolvedTransactions: 12,
    reviewRequiredTransactions: 0,
    unknownRoleTransactions: 0,
    unbalancedTransactions: 0,
    reconciliation: { total: 0, reconciled: 0, partial: 0, conflict: 0, stale: 0 },
    quality: 'ready',
  };
}

test('irregular-income profile uses only the common complete source-coverage window', () => {
  const profile = buildFinanceIrregularIncomeProfile(report(), 'ars');

  assert.equal(profile.currency, 'ARS');
  assert.equal(profile.commonCoverageStart, '2026-01-01');
  assert.equal(profile.commonCoverageEnd, '2026-02-28');
  assert.equal(profile.completeMonthCount, 2);
  assert.deepEqual(
    profile.months.map((month) => month.month),
    ['2026-01', '2026-02'],
  );
  assert.equal(profile.familySupport?.medianMinor, 200_000);
  assert.equal(profile.workIncome?.medianMinor, 250_000);
  assert.equal(profile.totalSpend?.medianMinor, 525_000);
  assert.equal(profile.bridgeWithoutWork?.medianMinor, 325_000);
  assert.equal(profile.negativeCashFlowMonths, 1);
  assert.equal(profile.negativeCashFlowShare, 0.5);
  assert.equal(profile.dataQuality, 'limited');
});

test('survival scenario separates zero-income runway from support-adjusted runway', () => {
  const scenario = evaluateFinanceSurvivalScenario({
    currency: 'ars',
    leanMonthlyBurnMinor: 350_000,
    expectedFamilySupportMinor: 200_000,
    eligibleLiquidityMinor: 600_000,
  });

  assert.equal(scenario.currency, 'ARS');
  assert.equal(scenario.monthlyBridgeMinor, 150_000);
  assert.equal(scenario.noNewIncomeRunwayMonths, 600_000 / 350_000);
  assert.equal(scenario.supportAdjustedRunwayMonths, 4);
  assert.equal(scenario.supportCoversLeanBurn, false);
});

test('survival scenario does not count support as guaranteed liquidity', () => {
  const scenario = evaluateFinanceSurvivalScenario({
    currency: 'ARS',
    leanMonthlyBurnMinor: 300_000,
    expectedFamilySupportMinor: 400_000,
    eligibleLiquidityMinor: 600_000,
  });

  assert.equal(scenario.monthlyBridgeMinor, 0);
  assert.equal(scenario.noNewIncomeRunwayMonths, 2);
  assert.equal(scenario.supportAdjustedRunwayMonths, null);
  assert.equal(scenario.supportCoversLeanBurn, true);
});
