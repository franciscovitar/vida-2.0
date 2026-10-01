import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFinanceMonthlyDashboard } from '@/lib/finance/monthly-dashboard-core';
import { FINANCE_SHEETS } from '@/lib/finance/store/schema';

function rows(headers: readonly string[], data: readonly (readonly unknown[])[]) {
  return [headers, ...data];
}

test('monthly dashboard counts only active current-month captures and groups expenses', () => {
  const model = buildFinanceMonthlyDashboard({
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      [
        'income',
        '2026-10-01T10:00:00-03:00',
        '2026-10-01T10:00:00-03:00',
        '+100 web',
        'income',
        10_000_000,
        'ARS',
        'ingreso web/freelance',
        'income_work',
        '',
        'active',
        '',
        'chatgpt_finance_logger',
        '',
      ],
      [
        'old-cafe',
        '2026-10-01T11:00:00-03:00',
        '2026-10-01T11:00:00-03:00',
        '15 cafe',
        'expense',
        1_500_000,
        'ARS',
        'cafe/salidas',
        'expense_personal',
        '',
        'corrected',
        '',
        'chatgpt_finance_logger',
        '',
      ],
      [
        'cafe',
        '2026-10-01T11:00:00-03:00',
        '2026-10-01T11:01:00-03:00',
        '12 cafe',
        'expense',
        1_200_000,
        'ARS',
        'cafe/salidas',
        'expense_personal',
        '',
        'active',
        'old-cafe',
        'chatgpt_finance_logger',
        '',
      ],
      [
        'fuel',
        '2026-10-01T12:00:00-03:00',
        '2026-10-01T12:00:00-03:00',
        '50 nafta',
        'expense',
        5_000_000,
        'ARS',
        'nafta',
        'expense_personal',
        '',
        'active',
        '',
        'chatgpt_finance_logger',
        '',
      ],
      [
        'september',
        '2026-09-30T12:00:00-03:00',
        '2026-09-30T12:00:00-03:00',
        '40 comida',
        'expense',
        4_000_000,
        'ARS',
        'comida',
        'expense_personal',
        '',
        'active',
        '',
        'chatgpt_finance_logger',
        '',
      ],
    ]),
    monthlyTargets: rows(FINANCE_SHEETS.monthlyTargets.headers, [
      [
        '2026-10',
        'ARS',
        35_000_000,
        35_000_000,
        40_000_000,
        'pending',
        'Ingresó más trabajo real este mes.',
        'chatgpt_finance_logger',
        '2026-10-10',
        '2026-10-10',
      ],
    ]),
    month: '2026-10',
    currency: 'ARS',
    asOf: '2026-10-10',
  });

  assert.equal(model.incomeMinor, 10_000_000);
  assert.equal(model.expenseMinor, 6_200_000);
  assert.equal(model.balanceMinor, 3_800_000);
  assert.equal(model.activeCaptureCount, 3);
  assert.equal(model.target?.activeTargetMinor, 35_000_000);
  assert.equal(model.target?.suggestedTargetMinor, 40_000_000);
  assert.equal(model.remainingTargetMinor, 28_800_000);
  assert.equal(model.categories[0].category, 'nafta');
  assert.equal(model.categories[0].amountMinor, 5_000_000);
  assert.equal(model.categories[1].category, 'cafe/salidas');
});

test('monthly dashboard never applies a pending suggestion as the active target', () => {
  const model = buildFinanceMonthlyDashboard({
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, []),
    monthlyTargets: rows(FINANCE_SHEETS.monthlyTargets.headers, [
      [
        '2026-10',
        'ARS',
        35_000_000,
        35_000_000,
        45_000_000,
        'pending',
        'Ingreso extraordinario cobrado.',
        'chatgpt_finance_logger',
        '2026-10-15',
        '2026-10-15',
      ],
    ]),
    month: '2026-10',
    currency: 'ARS',
    asOf: '2026-10-15',
  });

  assert.equal(model.target?.activeTargetMinor, 35_000_000);
  assert.equal(model.target?.suggestedTargetMinor, 45_000_000);
  assert.equal(model.remainingTargetMinor, 35_000_000);
});

test('monthly dashboard keeps reported liquidity separate and estimates opening cash', () => {
  const model = buildFinanceMonthlyDashboard({
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      [
        'income',
        '2026-10-01T10:00:00-03:00',
        '2026-10-01T10:00:00-03:00',
        '+100 web',
        'income',
        10_000_000,
        'ARS',
        'ingreso web/freelance',
        'income_work',
        '',
        'active',
        '',
        'chatgpt_finance_logger',
        '',
      ],
    ]),
    monthlyTargets: rows(FINANCE_SHEETS.monthlyTargets.headers, []),
    liquiditySnapshots: rows(FINANCE_SHEETS.liquiditySnapshots.headers, [
      [
        'liq-oct',
        '2026-10-01',
        'ARS',
        'naranja-x:ars',
        'Naranja X',
        25_000_000,
        'user_reported',
        'active',
        'chatgpt_finance_logger',
        '',
      ],
      [
        'liq-oct',
        '2026-10-01',
        'ARS',
        'cash:ars',
        'Efectivo',
        16_000_000,
        'user_reported',
        'active',
        'chatgpt_finance_logger',
        '',
      ],
      [
        'liq-sep',
        '2026-09-30',
        'ARS',
        'cash:ars',
        'Efectivo',
        99_000_000,
        'user_reported',
        'active',
        'chatgpt_finance_logger',
        '',
      ],
    ]),
    month: '2026-10',
    currency: 'ARS',
    asOf: '2026-10-01',
  });

  assert.equal(model.incomeMinor, 10_000_000);
  assert.equal(model.expenseMinor, 0);
  assert.equal(model.balanceMinor, 10_000_000);
  assert.equal(model.liquidityCushion?.totalMinor, 41_000_000);
  assert.equal(model.liquidityCushion?.openingEstimateMinor, 31_000_000);
  assert.equal(model.liquidityCushion?.quality, 'user_reported');
  assert.equal(model.liquidityCushion?.sources[0].label, 'Naranja X');
  assert.equal(model.liquidityCushion?.sources[1].label, 'Efectivo');
});
