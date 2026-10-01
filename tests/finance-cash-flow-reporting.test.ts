import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFinanceCashFlowReport } from '@/lib/finance/reporting/cash-flow-core';
import { FINANCE_SHEETS } from '@/lib/finance/store/schema';

function rows(headers: readonly string[], data: readonly (readonly unknown[])[]) {
  return [headers, ...data];
}

test('cash-flow reporting counts only personal economic roles on owned accounts', () => {
  const report = buildFinanceCashFlowReport({
    accounts: rows(FINANCE_SHEETS.accounts.headers, [
      [
        'owned-ars',
        'Bank',
        'ARS wallet',
        'wallet',
        'ARS',
        'owned',
        'personal',
        'immediate',
        'x',
        true,
        '',
        '',
      ],
      [
        'owned-ars-2',
        'Bank',
        'ARS wallet 2',
        'wallet',
        'ARS',
        'owned',
        'personal',
        'immediate',
        'x',
        true,
        '',
        '',
      ],
      [
        'owned-usd',
        'Bank',
        'USD wallet',
        'wallet',
        'USD',
        'owned',
        'personal',
        'immediate',
        'x',
        true,
        '',
        '',
      ],
      [
        'clear-ars',
        'Finance OS',
        'Clear ARS',
        'clearing',
        'ARS',
        'clearing',
        'mixed',
        'illiquid',
        'system',
        true,
        '',
        '',
      ],
      [
        'clear-usd',
        'Finance OS',
        'Clear USD',
        'clearing',
        'USD',
        'clearing',
        'mixed',
        'illiquid',
        'system',
        true,
        '',
        '',
      ],
    ]),
    importBatches: rows(FINANCE_SHEETS.importBatches.headers, [
      [
        'b1',
        'owned-ars',
        'test',
        '2026-01-01',
        '2026-02-28',
        'hash',
        'evidence',
        '',
        'imported',
        5,
      ],
      [
        'b2',
        'owned-usd',
        'test',
        '2026-02-01',
        '2026-02-28',
        'hash2',
        'evidence2',
        '',
        'imported',
        1,
      ],
    ]),
    transactions: rows(FINANCE_SHEETS.transactions.headers, [
      ['t1', '2026-01-05T12:00:00.000Z', 'income', 'posted', 1, 'resolved', '', ''],
      ['t2', '2026-01-06T12:00:00.000Z', 'expense', 'posted', 1, 'resolved', '', ''],
      ['t3', '2026-01-07T12:00:00.000Z', 'own transfer', 'posted', 1, 'resolved', '', ''],
      ['t4', '2026-01-08T12:00:00.000Z', 'reimbursement', 'posted', 1, 'resolved', '', ''],
      ['t5', '2026-02-01T12:00:00.000Z', 'refund', 'posted', 1, 'resolved', '', ''],
      ['t6', '2026-02-02T12:00:00.000Z', 'usd expense', 'posted', 1, 'resolved', '', ''],
      ['t7', '2026-02-03T12:00:00.000Z', 'unknown', 'posted', 1, 'review_required', '', ''],
    ]),
    postings: rows(FINANCE_SHEETS.postings.headers, [
      ['t1', 1, 'owned-ars', 100000, 'ARS', null, 'income_work', 'source', ''],
      ['t1', 2, 'clear-ars', -100000, 'ARS', null, 'income_work', 'contra', ''],
      ['t2', 1, 'owned-ars', -40000, 'ARS', null, 'expense_personal', 'source', ''],
      ['t2', 2, 'clear-ars', 40000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['t3', 1, 'owned-ars', -10000, 'ARS', null, 'internal_transfer', 'source', ''],
      ['t3', 2, 'owned-ars-2', 10000, 'ARS', null, 'internal_transfer', 'target', ''],
      ['t4', 1, 'owned-ars', 5000, 'ARS', null, 'reimbursement', 'source', ''],
      ['t4', 2, 'clear-ars', -5000, 'ARS', null, 'reimbursement', 'contra', ''],
      ['t5', 1, 'owned-ars', 2000, 'ARS', null, 'refund_adjustment', 'source', ''],
      ['t5', 2, 'clear-ars', -2000, 'ARS', null, 'refund_adjustment', 'contra', ''],
      ['t6', 1, 'owned-usd', -100, 'USD', null, 'expense_personal', 'source', ''],
      ['t6', 2, 'clear-usd', 100, 'USD', null, 'expense_personal', 'contra', ''],
      ['t7', 1, 'owned-ars', -300, 'ARS', null, 'unknown_review', 'source', ''],
      ['t7', 2, 'clear-ars', 300, 'ARS', null, 'unknown_review', 'contra', ''],
    ]),
    reconciliations: rows(FINANCE_SHEETS.reconciliations.headers, [
      ['r1', 'owned-ars', '', 0, 0, 0, 'ARS', 'reconciled', '', ''],
      ['r2', 'owned-ars', '', 0, 0, 0, 'ARS', 'conflict', '', ''],
    ]),
  });

  assert.deepEqual(report.currencies, [
    {
      currency: 'ARS',
      incomeMinor: 100000,
      expenseMinor: -40000,
      adjustmentMinor: 2000,
      netMinor: 62000,
    },
    {
      currency: 'USD',
      incomeMinor: 0,
      expenseMinor: -100,
      adjustmentMinor: 0,
      netMinor: -100,
    },
  ]);
  assert.deepEqual(report.monthlyRoleTotals, [
    {
      month: '2026-01',
      role: 'expense_personal',
      currency: 'ARS',
      count: 1,
      totalMinor: -40000,
    },
    {
      month: '2026-01',
      role: 'income_work',
      currency: 'ARS',
      count: 1,
      totalMinor: 100000,
    },
    {
      month: '2026-02',
      role: 'refund_adjustment',
      currency: 'ARS',
      count: 1,
      totalMinor: 2000,
    },
    {
      month: '2026-02',
      role: 'expense_personal',
      currency: 'USD',
      count: 1,
      totalMinor: -100,
    },
  ]);
  assert.equal(report.reviewRequiredTransactions, 1);
  assert.equal(report.unknownRoleTransactions, 1);
  assert.equal(report.unbalancedTransactions, 0);
  assert.equal(report.quality, 'attention');
  assert.deepEqual(report.reconciliation, {
    total: 2,
    reconciled: 1,
    partial: 0,
    conflict: 1,
    stale: 0,
  });
  assert.deepEqual(report.coverage, [
    {
      accountId: 'owned-ars',
      displayName: 'ARS wallet',
      currency: 'ARS',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-28',
      batchCount: 1,
      sourceRowCount: 5,
    },
    {
      accountId: 'owned-usd',
      displayName: 'USD wallet',
      currency: 'USD',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      batchCount: 1,
      sourceRowCount: 1,
    },
  ]);
});

test('cash-flow reporting flags an unbalanced canonical transaction', () => {
  const report = buildFinanceCashFlowReport({
    accounts: rows(FINANCE_SHEETS.accounts.headers, [
      [
        'owned',
        'Bank',
        'Wallet',
        'wallet',
        'ARS',
        'owned',
        'personal',
        'immediate',
        'x',
        true,
        '',
        '',
      ],
      [
        'clear',
        'Finance OS',
        'Clear',
        'clearing',
        'ARS',
        'clearing',
        'mixed',
        'illiquid',
        'system',
        true,
        '',
        '',
      ],
    ]),
    importBatches: rows(FINANCE_SHEETS.importBatches.headers, []),
    transactions: rows(FINANCE_SHEETS.transactions.headers, [
      ['t1', '2026-01-01', 'broken', 'posted', 1, 'resolved', '', ''],
    ]),
    postings: rows(FINANCE_SHEETS.postings.headers, [
      ['t1', 1, 'owned', -100, 'ARS', null, 'expense_personal', 'source', ''],
      ['t1', 2, 'clear', 90, 'ARS', null, 'expense_personal', 'contra', ''],
    ]),
    reconciliations: rows(FINANCE_SHEETS.reconciliations.headers, []),
  });

  assert.equal(report.unbalancedTransactions, 1);
  assert.equal(report.quality, 'attention');
});

test('cash-flow recurring candidates exclude generic payments and distinguish recent subscriptions', () => {
  const report = buildFinanceCashFlowReport({
    accounts: rows(FINANCE_SHEETS.accounts.headers, [
      [
        'owned',
        'Bank',
        'Wallet',
        'wallet',
        'ARS',
        'owned',
        'personal',
        'immediate',
        'x',
        true,
        '',
        '',
      ],
      [
        'clear',
        'Finance OS',
        'Clear',
        'clearing',
        'ARS',
        'clearing',
        'mixed',
        'illiquid',
        'system',
        true,
        '',
        '',
      ],
    ]),
    importBatches: rows(FINANCE_SHEETS.importBatches.headers, [
      ['b1', 'owned', 'test', '2026-01-01', '2026-08-31', 'hash', 'evidence', '', 'imported', 9],
    ]),
    transactions: rows(FINANCE_SHEETS.transactions.headers, [
      ['p1', '2026-05-02', 'Pago de suscripción Paramount Plus', 'posted', 1, 'resolved', '', ''],
      ['p2', '2026-06-02', 'Pago de suscripción Paramount Plus', 'posted', 1, 'resolved', '', ''],
      ['p3', '2026-07-02', 'Pago de suscripción Paramount Plus', 'posted', 1, 'resolved', '', ''],
      ['p4', '2026-08-02', 'Pago de suscripción Paramount Plus', 'posted', 1, 'resolved', '', ''],
      ['g1', '2026-01-05', 'Pago Google', 'posted', 1, 'resolved', '', ''],
      ['g2', '2026-02-05', 'Pago Google', 'posted', 1, 'resolved', '', ''],
      ['g3', '2026-03-05', 'Pago Google', 'posted', 1, 'resolved', '', ''],
      ['q1', '2026-05-10', 'Pago con QR', 'posted', 1, 'resolved', '', ''],
      ['q2', '2026-06-10', 'Pago con QR', 'posted', 1, 'resolved', '', ''],
      ['q3', '2026-07-10', 'Pago con QR', 'posted', 1, 'resolved', '', ''],
    ]),
    postings: rows(FINANCE_SHEETS.postings.headers, [
      ['p1', 1, 'owned', -5000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['p1', 2, 'clear', 5000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['p2', 1, 'owned', -5500, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['p2', 2, 'clear', 5500, 'ARS', null, 'expense_personal', 'contra', ''],
      ['p3', 1, 'owned', -6000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['p3', 2, 'clear', 6000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['p4', 1, 'owned', -6000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['p4', 2, 'clear', 6000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['g1', 1, 'owned', -1000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['g1', 2, 'clear', 1000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['g2', 1, 'owned', -1000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['g2', 2, 'clear', 1000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['g3', 1, 'owned', -1000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['g3', 2, 'clear', 1000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['q1', 1, 'owned', -40000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['q1', 2, 'clear', 40000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['q2', 1, 'owned', -45000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['q2', 2, 'clear', 45000, 'ARS', null, 'expense_personal', 'contra', ''],
      ['q3', 1, 'owned', -50000, 'ARS', null, 'expense_personal', 'source_account_movement', ''],
      ['q3', 2, 'clear', 50000, 'ARS', null, 'expense_personal', 'contra', ''],
    ]),
    reconciliations: rows(FINANCE_SHEETS.reconciliations.headers, []),
  });

  assert.deepEqual(report.recurringExpenseCandidates, [
    {
      label: 'Pago de suscripción Paramount Plus',
      currency: 'ARS',
      observedMonths: 4,
      firstSeenMonth: '2026-05',
      lastSeenMonth: '2026-08',
      medianMonthlyMinor: 5750,
      state: 'probable-current',
    },
    {
      label: 'Pago Google',
      currency: 'ARS',
      observedMonths: 3,
      firstSeenMonth: '2026-01',
      lastSeenMonth: '2026-03',
      medianMonthlyMinor: 1000,
      state: 'stale-observed',
    },
  ]);
});
