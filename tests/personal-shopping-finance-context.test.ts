import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { FinanceMonthlyDashboard } from '@/lib/finance/monthly-dashboard-core';
import { buildFinancePlanningSnapshot } from '@/lib/finance/planning-core';
import {
  FINANCE_PLANNING_SOURCE_VERSION,
  type FinancePlanningReadModel,
} from '@/lib/finance/planning-store-core';
import {
  buildPersonalShoppingFinanceContext,
  EMPTY_PERSONAL_SHOPPING_FINANCE_CONTEXT,
  evaluatePersonalShoppingFinanceImpact,
} from '@/lib/personal-shopping/finance-context-core';
import type { PersonalPurchaseItem } from '@/lib/personal-shopping/types';

function shoppingItem(
  overrides: Partial<PersonalPurchaseItem> = {},
): PersonalPurchaseItem {
  return {
    id: 'ps_item-1',
    title: 'Auriculares',
    state: 'BUY',
    need: null,
    quantityText: null,
    category: null,
    currency: 'ARS',
    estimatedPriceMinor: 2_500_000,
    targetPriceMinor: null,
    purchaseCondition: null,
    notes: null,
    candidateLinks: [],
    focus: false,
    createdAt: '2026-10-07T12:00:00.000Z',
    updatedAt: '2026-10-07T12:00:00.000Z',
    purchasedAt: null,
    discardedAt: null,
    sourceRef: null,
    financeMovementId: null,
    financeLinkState: 'none',
    recordStatus: 'active',
    ...overrides,
  };
}

function monthlyDashboard(): FinanceMonthlyDashboard {
  return {
    month: '2026-10',
    currency: 'ARS',
    incomeMinor: 12_000_000,
    expenseMinor: 4_000_000,
    balanceMinor: 8_000_000,
    activeCaptureCount: 4,
    liquidityCushion: null,
    target: {
      month: '2026-10',
      currency: 'ARS',
      baseTargetMinor: 10_000_000,
      activeTargetMinor: 10_000_000,
      suggestedTargetMinor: null,
      suggestionStatus: '',
      suggestionReason: '',
      suggestionSource: '',
      suggestedAt: null,
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    remainingTargetMinor: 6_000_000,
    targetUsedRatio: 0.4,
    monthElapsedRatio: 0.25,
    pace: 'watch',
    categories: [],
    recentMovements: [],
  };
}

function planningModel(
  status: 'ready' | 'configuration-required',
): FinancePlanningReadModel {
  const snapshot =
    status === 'ready'
      ? buildFinancePlanningSnapshot({
          asOf: '2026-10-07T12:00:00.000Z',
          currency: 'ARS',
          eligibleLiquidityMinor: 10_000_000,
          commitments: [
            {
              id: 'reserve',
              label: 'Reserva',
              bucket: 'reserve',
              amountMinor: 2_000_000,
              currency: 'ARS',
              overlapGroup: null,
            },
          ],
        })
      : null;

  return {
    version: FINANCE_PLANNING_SOURCE_VERSION,
    asOf: '2026-10-07T12:00:00.000Z',
    maxBalanceAgeDays: 35,
    obligationHorizonDays: 31,
    includedAccounts: [],
    excludedAccounts: [],
    currencies: [
      {
        currency: 'ARS',
        status,
        eligibleLiquidityMinor: 10_000_000,
        liquidityQuality: 'verified',
        includedAccountCount: 1,
        commitmentCount: status === 'ready' ? 1 : 0,
        essentialMonthlyBurnMinor: null,
        missing: status === 'ready' ? [] : ['reserve-policy'],
        issues: [],
        snapshot,
      },
    ],
  };
}

test('shopping finance context reuses monthly target and official Safe-to-Spend scenario', () => {
  const context = buildPersonalShoppingFinanceContext({
    monthly: monthlyDashboard(),
    planning: planningModel('ready'),
  });
  const impact = evaluatePersonalShoppingFinanceImpact(shoppingItem(), context);

  assert.ok(impact);
  assert.equal(impact.monthlyTarget?.remainingTargetMinor, 6_000_000);
  assert.equal(impact.monthlyTarget?.postRemainingTargetMinor, 3_500_000);
  assert.equal(impact.monthlyTarget?.projectedOverTargetMinor, 0);
  assert.equal(impact.safeToSpend?.scenario.preSafeToSpendMinor, 8_000_000);
  assert.equal(impact.safeToSpend?.scenario.postSafeToSpendMinor, 5_500_000);
  assert.equal(impact.safeToSpend?.scenario.capacityState, 'within-safe-capacity');
});

test('shopping finance context omits Safe-to-Spend unless Finance Planning is ready', () => {
  const context = buildPersonalShoppingFinanceContext({
    monthly: monthlyDashboard(),
    planning: planningModel('configuration-required'),
  });
  const impact = evaluatePersonalShoppingFinanceImpact(shoppingItem(), context);

  assert.ok(impact);
  assert.ok(impact.monthlyTarget);
  assert.equal(impact.safeToSpend, null);
  assert.deepEqual(context.safeToSpend, []);
});

test('shopping finance impact fails closed when Finance evidence for the item currency is absent', () => {
  const impact = evaluatePersonalShoppingFinanceImpact(
    shoppingItem({ currency: 'USD' }),
    EMPTY_PERSONAL_SHOPPING_FINANCE_CONTEXT,
  );

  assert.ok(impact);
  assert.equal(impact.monthlyTarget, null);
  assert.equal(impact.safeToSpend, null);
});

test('shopping finance impact stays out of history and unpriced items', () => {
  assert.equal(
    evaluatePersonalShoppingFinanceImpact(
      shoppingItem({ state: 'PURCHASED' }),
      EMPTY_PERSONAL_SHOPPING_FINANCE_CONTEXT,
    ),
    null,
  );
  assert.equal(
    evaluatePersonalShoppingFinanceImpact(
      shoppingItem({ estimatedPriceMinor: null }),
      EMPTY_PERSONAL_SHOPPING_FINANCE_CONTEXT,
    ),
    null,
  );
});
