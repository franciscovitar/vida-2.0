import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFinancePlanningReadModel,
  FINANCE_PLANNING_POLICY_V1,
} from '@/lib/finance/planning-store-core';
import { FINANCE_SHEETS } from '@/lib/finance/store/schema';

function rows(headers: readonly string[], data: readonly (readonly unknown[])[]) {
  return [headers, ...data];
}

const POLICY = {
  asOf: '2026-10-01T12:00:00.000Z',
  ...FINANCE_PLANNING_POLICY_V1,
};

function emptyPlanningRows() {
  return {
    obligations: rows(FINANCE_SHEETS.obligations.headers, []),
    goals: rows(FINANCE_SHEETS.goals.headers, []),
    commitments: rows(FINANCE_SHEETS.commitments.headers, []),
  };
}

test('planning store uses only fresh reconciled personal immediate liquidity', () => {
  const model = buildFinancePlanningReadModel(
    {
      accounts: rows(FINANCE_SHEETS.accounts.headers, [
        [
          'ars',
          'Bank',
          'ARS',
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
          'mixed',
          'Wallet',
          'Mixed ARS',
          'wallet',
          'ARS',
          'owned',
          'mixed',
          'immediate',
          'x',
          true,
          '',
          '',
        ],
      ]),
      reconciliations: rows(FINANCE_SHEETS.reconciliations.headers, [
        ['r1', 'ars', '2026-09-30T23:59:59.999Z', 100_000, 100_000, 0, 'ARS', 'partial', '', ''],
        ['r2', 'mixed', '2026-09-30T23:59:59.999Z', 50_000, 50_000, 0, 'ARS', 'reconciled', '', ''],
      ]),
      ...emptyPlanningRows(),
    },
    POLICY,
  );

  assert.equal(model.includedAccounts.length, 1);
  assert.equal(model.includedAccounts[0]?.accountId, 'ars');
  assert.equal(model.excludedAccounts[0]?.reason, 'non-personal-scope');

  const ars = model.currencies.find((item) => item.currency === 'ARS');
  assert.ok(ars);
  assert.equal(ars.eligibleLiquidityMinor, 100_000);
  assert.equal(ars.liquidityQuality, 'partial');
  assert.equal(ars.status, 'configuration-required');
  assert.deepEqual(ars.missing, ['reserve-policy']);
  assert.equal(ars.snapshot, null);
});

test('planning store excludes stale balances and latest reconciliation conflicts', () => {
  const model = buildFinancePlanningReadModel(
    {
      accounts: rows(FINANCE_SHEETS.accounts.headers, [
        [
          'old',
          'Bank',
          'Old',
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
          'conflict',
          'Bank',
          'Conflict',
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
      ]),
      reconciliations: rows(FINANCE_SHEETS.reconciliations.headers, [
        [
          'old-r',
          'old',
          '2026-07-01T00:00:00.000Z',
          20_000,
          20_000,
          0,
          'ARS',
          'reconciled',
          '',
          '',
        ],
        [
          'good-before-conflict',
          'conflict',
          '2026-09-01T00:00:00.000Z',
          30_000,
          30_000,
          0,
          'ARS',
          'reconciled',
          '',
          '',
        ],
        [
          'latest-conflict',
          'conflict',
          '2026-09-30T00:00:00.000Z',
          30_000,
          31_000,
          1_000,
          'ARS',
          'conflict',
          '',
          '',
        ],
      ]),
      ...emptyPlanningRows(),
    },
    POLICY,
  );

  assert.equal(model.includedAccounts.length, 0);
  assert.deepEqual(model.excludedAccounts.map((item) => item.reason).sort(), [
    'stale-balance',
    'untrusted-reconciliation',
  ]);
});

test('planning store maps obligations and explicit reserve/goal commitments without subtracting goal targets', () => {
  const model = buildFinancePlanningReadModel(
    {
      accounts: rows(FINANCE_SHEETS.accounts.headers, [
        [
          'ars',
          'Bank',
          'ARS',
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
      ]),
      reconciliations: rows(FINANCE_SHEETS.reconciliations.headers, [
        ['r1', 'ars', '2026-10-01T00:00:00.000Z', 100_000, 100_000, 0, 'ARS', 'reconciled', '', ''],
      ]),
      obligations: rows(FINANCE_SHEETS.obligations.headers, [
        ['rent', 'Rent', 10_000, 'ARS', 'monthly', '2026-10-15', true, true, '', ''],
        ['later', 'Later', 20_000, 'ARS', 'monthly', '2026-12-15', true, true, '', ''],
      ]),
      goals: rows(FINANCE_SHEETS.goals.headers, [
        ['car', 'Car', 500_000, 'ARS', '2027-01-01', 1, 'active', '', ''],
      ]),
      commitments: rows(FINANCE_SHEETS.commitments.headers, [
        ['reserve', 'reserve', 'base', 20_000, 'ARS', '', '', '', true, ''],
        ['goal', 'goal', 'car', 5_000, 'ARS', '', '', '', true, ''],
        ['other', 'other', 'annual-fee', 3_000, 'ARS', '', '', '', true, ''],
      ]),
    },
    POLICY,
  );

  const ars = model.currencies.find((item) => item.currency === 'ARS');
  assert.ok(ars);
  assert.equal(ars.status, 'ready');
  assert.equal(ars.commitmentCount, 4);
  assert.equal(ars.essentialMonthlyBurnMinor, 30_000);
  assert.equal(ars.snapshot?.commitments.upcomingObligationsMinor, 10_000);
  assert.equal(ars.snapshot?.commitments.protectedReserveMinor, 20_000);
  assert.equal(ars.snapshot?.commitments.committedGoalFundingMinor, 5_000);
  assert.equal(ars.snapshot?.commitments.otherCommitmentsMinor, 3_000);
  assert.equal(ars.snapshot?.safeToSpend.safeToSpendMinor, 62_000);
});

test('planning store blocks overlapping commitments instead of double subtracting', () => {
  const model = buildFinancePlanningReadModel(
    {
      accounts: rows(FINANCE_SHEETS.accounts.headers, [
        [
          'ars',
          'Bank',
          'ARS',
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
      ]),
      reconciliations: rows(FINANCE_SHEETS.reconciliations.headers, [
        ['r1', 'ars', '2026-10-01T00:00:00.000Z', 100_000, 100_000, 0, 'ARS', 'reconciled', '', ''],
      ]),
      obligations: rows(FINANCE_SHEETS.obligations.headers, []),
      goals: rows(FINANCE_SHEETS.goals.headers, [
        ['goal-1', 'Goal', 100_000, 'ARS', '2027-01-01', 1, 'active', '', ''],
      ]),
      commitments: rows(FINANCE_SHEETS.commitments.headers, [
        ['reserve', 'reserve', 'base', 20_000, 'ARS', '', '', 'shared', true, ''],
        ['goal', 'goal', 'goal-1', 10_000, 'ARS', '', '', 'shared', true, ''],
      ]),
    },
    POLICY,
  );

  const ars = model.currencies.find((item) => item.currency === 'ARS');
  assert.ok(ars);
  assert.equal(ars.status, 'invalid');
  assert.equal(ars.snapshot, null);
  assert.equal(ars.issues.at(-1)?.code, 'invalid-planning-commitments');
});
