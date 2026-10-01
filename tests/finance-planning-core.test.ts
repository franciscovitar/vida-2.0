import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFinancePlanningSnapshot,
  evaluateFinancePurchaseScenario,
} from '@/lib/finance/planning-core';

const commitments = [
  {
    id: 'reserve-primary',
    label: 'Reserve',
    bucket: 'reserve' as const,
    amountMinor: 200_000,
    currency: 'ARS',
    overlapGroup: null,
  },
  {
    id: 'rent',
    label: 'Upcoming obligation',
    bucket: 'obligation' as const,
    amountMinor: 150_000,
    currency: 'ARS',
    overlapGroup: null,
  },
  {
    id: 'goal-car',
    label: 'Goal funding',
    bucket: 'goal' as const,
    amountMinor: 100_000,
    currency: 'ARS',
    overlapGroup: null,
  },
  {
    id: 'commitment-other',
    label: 'Other commitment',
    bucket: 'other' as const,
    amountMinor: 50_000,
    currency: 'ARS',
    overlapGroup: null,
  },
];

test('planning core aggregates non-overlapping commitments into safe-to-spend', () => {
  const snapshot = buildFinancePlanningSnapshot({
    asOf: '2026-10-01',
    currency: 'ars',
    eligibleLiquidityMinor: 1_000_000,
    essentialMonthlyBurnMinor: 400_000,
    commitments,
  });

  assert.equal(snapshot.currency, 'ARS');
  assert.deepEqual(snapshot.commitments, {
    count: 4,
    protectedReserveMinor: 200_000,
    upcomingObligationsMinor: 150_000,
    committedGoalFundingMinor: 100_000,
    otherCommitmentsMinor: 50_000,
  });
  assert.equal(snapshot.safeToSpend.safeToSpendMinor, 500_000);
  assert.equal(snapshot.safeToSpend.status, 'available');
  assert.equal(snapshot.resilience.reserveCoverageMonths, 0.5);
  assert.equal(snapshot.resilience.essentialCoverageMonths, 2.5);
});

test('planning core rejects duplicate commitment ids and unresolved overlap groups', () => {
  assert.throws(
    () =>
      buildFinancePlanningSnapshot({
        asOf: '2026-10-01',
        currency: 'ARS',
        eligibleLiquidityMinor: 1_000_000,
        commitments: [commitments[0], { ...commitments[0] }],
      }),
    /duplicate commitment id/,
  );

  assert.throws(
    () =>
      buildFinancePlanningSnapshot({
        asOf: '2026-10-01',
        currency: 'ARS',
        eligibleLiquidityMinor: 1_000_000,
        commitments: [
          { ...commitments[0], overlapGroup: 'shared-capacity' },
          { ...commitments[1], overlapGroup: 'shared-capacity' },
        ],
      }),
    /resolve overlap before calculation/,
  );
});

test('planning core refuses cross-currency commitments', () => {
  assert.throws(
    () =>
      buildFinancePlanningSnapshot({
        asOf: '2026-10-01',
        currency: 'ARS',
        eligibleLiquidityMinor: 1_000_000,
        commitments: [{ ...commitments[0], currency: 'USD' }],
      }),
    /currency must match planning currency ARS/,
  );
});

test('purchase scenario stays descriptive and preserves protected capacity', () => {
  const snapshot = buildFinancePlanningSnapshot({
    asOf: '2026-10-01',
    currency: 'ARS',
    eligibleLiquidityMinor: 1_000_000,
    commitments,
  });

  const within = evaluateFinancePurchaseScenario(snapshot, 300_000);
  assert.equal(within.capacityState, 'within-safe-capacity');
  assert.equal(within.postSafeToSpendMinor, 200_000);
  assert.equal(within.postShortfallMinor, 0);
  assert.equal(within.beyondSafeCapacityMinor, 0);

  const protectedCapacity = evaluateFinancePurchaseScenario(snapshot, 650_000);
  assert.equal(protectedCapacity.capacityState, 'uses-protected-capacity');
  assert.equal(protectedCapacity.postSafeToSpendMinor, 0);
  assert.equal(protectedCapacity.postShortfallMinor, 150_000);
  assert.equal(protectedCapacity.beyondSafeCapacityMinor, 150_000);
  assert.equal(protectedCapacity.exceedsEligibleLiquidityByMinor, 0);
});

test('purchase scenario distinguishes a liquidity overrun from safe-capacity use', () => {
  const snapshot = buildFinancePlanningSnapshot({
    asOf: '2026-10-01',
    currency: 'ARS',
    eligibleLiquidityMinor: 1_000_000,
    commitments,
  });

  const scenario = evaluateFinancePurchaseScenario(snapshot, 1_100_000);
  assert.equal(scenario.capacityState, 'exceeds-liquidity');
  assert.equal(scenario.postEligibleLiquidityMinor, -100_000);
  assert.equal(scenario.postSafeToSpendMinor, 0);
  assert.equal(scenario.postShortfallMinor, 600_000);
  assert.equal(scenario.exceedsEligibleLiquidityByMinor, 100_000);
});

test('zero or missing essential burn leaves coverage months explicitly unavailable', () => {
  const withoutBurn = buildFinancePlanningSnapshot({
    asOf: '2026-10-01',
    currency: 'ARS',
    eligibleLiquidityMinor: 1_000_000,
    commitments: [],
  });
  const zeroBurn = buildFinancePlanningSnapshot({
    asOf: '2026-10-01',
    currency: 'ARS',
    eligibleLiquidityMinor: 1_000_000,
    essentialMonthlyBurnMinor: 0,
    commitments: [],
  });

  assert.equal(withoutBurn.resilience.essentialCoverageMonths, null);
  assert.equal(withoutBurn.resilience.reserveCoverageMonths, null);
  assert.equal(zeroBurn.resilience.essentialCoverageMonths, null);
  assert.equal(zeroBurn.resilience.reserveCoverageMonths, null);
});
