import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFinanceAnalysisView,
  normalizeFinanceAnalysisRange,
} from '@/lib/finance/analysis-core';
import type { FinanceCashFlowReport } from '@/lib/finance/reporting/cash-flow-core';

function report(): FinanceCashFlowReport {
  return {
    currencies: [],
    monthly: [
      {
        month: '2026-01',
        currency: 'ARS',
        incomeMinor: 100_000,
        expenseMinor: -40_000,
        adjustmentMinor: 0,
        netMinor: 60_000,
        eventCount: 2,
      },
      {
        month: '2026-02',
        currency: 'ARS',
        incomeMinor: 120_000,
        expenseMinor: -50_000,
        adjustmentMinor: 0,
        netMinor: 70_000,
        eventCount: 2,
      },
      {
        month: '2026-03',
        currency: 'ARS',
        incomeMinor: 150_000,
        expenseMinor: -60_000,
        adjustmentMinor: 5_000,
        netMinor: 95_000,
        eventCount: 3,
      },
      {
        month: '2026-05',
        currency: 'ARS',
        incomeMinor: 200_000,
        expenseMinor: -80_000,
        adjustmentMinor: 0,
        netMinor: 120_000,
        eventCount: 2,
      },
      {
        month: '2026-05',
        currency: 'USD',
        incomeMinor: 10_000,
        expenseMinor: -2_000,
        adjustmentMinor: 0,
        netMinor: 8_000,
        eventCount: 2,
      },
    ],
    roleTotals: [],
    monthlyRoleTotals: [
      {
        month: '2026-03',
        role: 'income_work',
        currency: 'ARS',
        count: 1,
        totalMinor: 150_000,
      },
      {
        month: '2026-03',
        role: 'expense_personal',
        currency: 'ARS',
        count: 1,
        totalMinor: -60_000,
      },
      {
        month: '2026-03',
        role: 'refund_adjustment',
        currency: 'ARS',
        count: 1,
        totalMinor: 5_000,
      },
      {
        month: '2026-05',
        role: 'income_work',
        currency: 'ARS',
        count: 1,
        totalMinor: 200_000,
      },
      {
        month: '2026-05',
        role: 'expense_personal',
        currency: 'ARS',
        count: 1,
        totalMinor: -80_000,
      },
      {
        month: '2026-05',
        role: 'income_work',
        currency: 'USD',
        count: 1,
        totalMinor: 10_000,
      },
    ],
    coverage: [],
    transactionCount: 10,
    resolvedTransactions: 10,
    reviewRequiredTransactions: 0,
    unknownRoleTransactions: 0,
    unbalancedTransactions: 0,
    reconciliation: { total: 0, reconciled: 0, partial: 0, conflict: 0, stale: 0 },
    quality: 'ready',
  };
}

test('analysis range defaults safely and accepts only supported values', () => {
  assert.equal(normalizeFinanceAnalysisRange(undefined), '6m');
  assert.equal(normalizeFinanceAnalysisRange('3M'), '3m');
  assert.equal(normalizeFinanceAnalysisRange(['ytd', '12m']), 'ytd');
  assert.equal(normalizeFinanceAnalysisRange('all'), '6m');
});

test('analysis 3M window aggregates only selected native-currency months and exposes gaps', () => {
  const view = buildFinanceAnalysisView(report(), 'ars', '3m');

  assert.ok(view);
  assert.equal(view.currency, 'ARS');
  assert.equal(view.windowStartMonth, '2026-03');
  assert.equal(view.windowEndMonth, '2026-05');
  assert.equal(view.expectedMonthCount, 3);
  assert.equal(view.observedMonthCount, 2);
  assert.equal(view.hasMonthGaps, true);
  assert.deepEqual(
    view.monthly.map((row) => row.month),
    ['2026-03', '2026-05'],
  );
  assert.deepEqual(view.totals, {
    currency: 'ARS',
    incomeMinor: 350_000,
    expenseMinor: -140_000,
    adjustmentMinor: 5_000,
    netMinor: 215_000,
  });
  assert.deepEqual(view.roleTotals, [
    {
      role: 'income_work',
      currency: 'ARS',
      count: 2,
      totalMinor: 350_000,
    },
    {
      role: 'expense_personal',
      currency: 'ARS',
      count: 2,
      totalMinor: -140_000,
    },
    {
      role: 'refund_adjustment',
      currency: 'ARS',
      count: 1,
      totalMinor: 5_000,
    },
  ]);
});

test('analysis YTD anchors to the latest observed month instead of inventing future coverage', () => {
  const view = buildFinanceAnalysisView(report(), 'ARS', 'ytd');

  assert.ok(view);
  assert.equal(view.windowStartMonth, '2026-01');
  assert.equal(view.windowEndMonth, '2026-05');
  assert.equal(view.expectedMonthCount, 5);
  assert.equal(view.observedMonthCount, 4);
  assert.equal(view.observedStartMonth, '2026-01');
  assert.equal(view.observedEndMonth, '2026-05');
});

test('analysis keeps currencies separate', () => {
  const view = buildFinanceAnalysisView(report(), 'USD', '12m');

  assert.ok(view);
  assert.equal(view.currency, 'USD');
  assert.deepEqual(view.totals, {
    currency: 'USD',
    incomeMinor: 10_000,
    expenseMinor: -2_000,
    adjustmentMinor: 0,
    netMinor: 8_000,
  });
  assert.deepEqual(view.monthly.map((row) => row.currency), ['USD']);
});
