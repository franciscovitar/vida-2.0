import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NaranjaStatementResult } from '@/lib/finance/importers/naranja-x';
import { buildNaranjaReconciliationPlan } from '@/lib/finance/reconciliation/naranja-reconciliation-plan';

function statement(
  currency: 'ARS' | 'USD',
  openingBalanceMinor: number,
  amounts: number[],
  statementClosingBalanceMinor: number | null,
): NaranjaStatementResult {
  let running = openingBalanceMinor;

  return {
    sections: [
      {
        currency,
        statementClosed: statementClosingBalanceMinor !== null,
        openingBalanceMinor,
        statementClosingBalanceMinor,
        derivedClosingBalanceMinor:
          openingBalanceMinor + amounts.reduce((sum, value) => sum + value, 0),
        duplicateSourceTransactionIds: [],
        reconciliationDifferenceMinor:
          statementClosingBalanceMinor === null
            ? null
            : openingBalanceMinor +
              amounts.reduce((sum, value) => sum + value, 0) -
              statementClosingBalanceMinor,
        transactions: amounts.map((amountMinor, index) => {
          running += amountMinor;
          return {
            sourceTransactionId: String(10_000_000_000 + index),
            occurredOn: '2026-01-01',
            description: 'Synthetic transaction',
            sourceAmountMinor: Math.abs(amountMinor),
            amountMinor,
            balanceAfterMinor: running,
            currency,
          };
        }),
      },
    ],
  };
}

test('reconciliation plan creates closing checks plus cross-statement continuity checks', () => {
  const plan = buildNaranjaReconciliationPlan(
    [
      {
        statementPeriod: '2026-01',
        evidenceRef: 'drive:jan',
        parsed: statement('ARS', 100_000, [25_000], 125_000),
      },
      {
        statementPeriod: '2026-02',
        evidenceRef: 'drive:feb',
        parsed: statement('ARS', 120_000, [10_000], 130_000),
      },
    ],
    '2026-09-30T18:30:00.000Z',
  );

  assert.equal(plan.rowCount, 3);
  assert.deepEqual(plan.statusCounts, {
    reconciled: 2,
    partial: 0,
    conflict: 1,
  });

  const rows = plan.reconciliations.rows;
  assert.equal(rows[0][0], 'finance-recon:naranja-x:2026-01:ars:closing');
  assert.equal(rows[1][0], 'finance-recon:naranja-x:2026-02:ars:opening');
  assert.equal(rows[1][5], 5_000);
  assert.equal(rows[1][7], 'conflict');
  assert.equal(rows[2][0], 'finance-recon:naranja-x:2026-02:ars:closing');
});

test('reconciliation plan preserves a printed closing-summary conflict', () => {
  const plan = buildNaranjaReconciliationPlan(
    [
      {
        statementPeriod: '2026-07',
        evidenceRef: 'drive:jul',
        parsed: statement('ARS', 100_000, [20_000], 110_000),
      },
    ],
    '2026-09-30T18:30:00.000Z',
  );

  assert.deepEqual(plan.statusCounts, {
    reconciled: 0,
    partial: 0,
    conflict: 1,
  });
  assert.equal(plan.reconciliations.rows[0][5], 10_000);
  assert.equal(plan.reconciliations.rows[0][7], 'conflict');
});

test('reconciliation plan marks a current statement partial without inventing a close', () => {
  const plan = buildNaranjaReconciliationPlan(
    [
      {
        statementPeriod: '2026-09',
        evidenceRef: 'drive:sep',
        parsed: statement('USD', 100, [50], null),
      },
    ],
    '2026-09-30T18:30:00.000Z',
  );

  assert.deepEqual(plan.statusCounts, {
    reconciled: 0,
    partial: 1,
    conflict: 0,
  });
  assert.equal(plan.reconciliations.rows[0][3], 150);
  assert.equal(plan.reconciliations.rows[0][4], 150);
  assert.equal(plan.reconciliations.rows[0][5], 0);
  assert.equal(plan.reconciliations.rows[0][7], 'partial');
});

test('reconciliation plan rejects duplicate periods and ledger movement mismatches', () => {
  const jan = {
    statementPeriod: '2026-01',
    evidenceRef: 'drive:jan',
    parsed: statement('ARS', 100_000, [25_000], 125_000),
  };

  assert.throws(
    () => buildNaranjaReconciliationPlan([jan, jan], '2026-09-30T18:30:00.000Z'),
    /Duplicate Naranja statement period/,
  );

  const broken = statement('ARS', 100_000, [25_000], 125_000);
  broken.sections[0].derivedClosingBalanceMinor = 124_999;

  assert.throws(
    () =>
      buildNaranjaReconciliationPlan(
        [{ statementPeriod: '2026-01', evidenceRef: 'drive:jan', parsed: broken }],
        '2026-09-30T18:30:00.000Z',
      ),
    /ledger movement mismatch/,
  );
});
