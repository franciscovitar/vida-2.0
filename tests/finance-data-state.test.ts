import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveFinanceDataState, type FinanceDataStateReport } from '@/lib/finance/data-state';

function report(overrides: Partial<FinanceDataStateReport> = {}): FinanceDataStateReport {
  return {
    reviewRequiredTransactions: 0,
    unknownRoleTransactions: 0,
    unbalancedTransactions: 0,
    reconciliation: {
      conflict: 0,
      partial: 0,
      stale: 0,
    },
    ...overrides,
  };
}

test('finance data state fails closed when the source or report is unavailable', () => {
  assert.equal(resolveFinanceDataState({ connected: false, report: null }), 'unavailable');
  assert.equal(resolveFinanceDataState({ connected: true, report: null }), 'partial');
});

test('finance data state surfaces review-worthy anomalies', () => {
  assert.equal(
    resolveFinanceDataState({
      connected: true,
      report: report({ reviewRequiredTransactions: 1 }),
    }),
    'review',
  );
  assert.equal(
    resolveFinanceDataState({
      connected: true,
      report: report({ unknownRoleTransactions: 1 }),
    }),
    'review',
  );
  assert.equal(
    resolveFinanceDataState({
      connected: true,
      report: report({ unbalancedTransactions: 1 }),
    }),
    'review',
  );
  assert.equal(
    resolveFinanceDataState({
      connected: true,
      report: report({
        reconciliation: { conflict: 1, partial: 0, stale: 0 },
      }),
    }),
    'review',
  );
});

test('finance data state distinguishes partial evidence from ready evidence', () => {
  assert.equal(
    resolveFinanceDataState({
      connected: true,
      report: report({
        reconciliation: { conflict: 0, partial: 1, stale: 0 },
      }),
    }),
    'partial',
  );
  assert.equal(
    resolveFinanceDataState({
      connected: true,
      report: report({
        reconciliation: { conflict: 0, partial: 0, stale: 1 },
      }),
    }),
    'partial',
  );
  assert.equal(resolveFinanceDataState({ connected: true, report: report() }), 'ready');
});
