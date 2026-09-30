import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateSafeToSpend } from '@/lib/finance/safe-to-spend';

test('safe-to-spend subtracts explicit non-overlapping commitments', () => {
  const result = calculateSafeToSpend({
    eligibleLiquidityMinor: 1_000_000,
    protectedReserveMinor: 200_000,
    upcomingObligationsMinor: 150_000,
    committedGoalFundingMinor: 100_000,
    otherCommitmentsMinor: 50_000,
  });

  assert.equal(result.committedTotalMinor, 500_000);
  assert.equal(result.rawSafeToSpendMinor, 500_000);
  assert.equal(result.safeToSpendMinor, 500_000);
  assert.equal(result.shortfallMinor, 0);
  assert.equal(result.status, 'available');
});

test('safe-to-spend exposes a shortfall instead of a negative display amount', () => {
  const result = calculateSafeToSpend({
    eligibleLiquidityMinor: 300_000,
    protectedReserveMinor: 200_000,
    upcomingObligationsMinor: 150_000,
    committedGoalFundingMinor: 25_000,
    otherCommitmentsMinor: 0,
  });

  assert.equal(result.rawSafeToSpendMinor, -75_000);
  assert.equal(result.safeToSpendMinor, 0);
  assert.equal(result.shortfallMinor, 75_000);
  assert.equal(result.status, 'shortfall');
});

test('safe-to-spend reports fully committed liquidity at exactly zero', () => {
  const result = calculateSafeToSpend({
    eligibleLiquidityMinor: 300_000,
    protectedReserveMinor: 100_000,
    upcomingObligationsMinor: 100_000,
    committedGoalFundingMinor: 100_000,
    otherCommitmentsMinor: 0,
  });

  assert.equal(result.safeToSpendMinor, 0);
  assert.equal(result.shortfallMinor, 0);
  assert.equal(result.status, 'fully-committed');
});

test('safe-to-spend rejects negative or non-integer money inputs', () => {
  assert.throws(
    () =>
      calculateSafeToSpend({
        eligibleLiquidityMinor: 100_000,
        protectedReserveMinor: -1,
        upcomingObligationsMinor: 0,
        committedGoalFundingMinor: 0,
        otherCommitmentsMinor: 0,
      }),
    RangeError,
  );

  assert.throws(
    () =>
      calculateSafeToSpend({
        eligibleLiquidityMinor: 100_000.5,
        protectedReserveMinor: 0,
        upcomingObligationsMinor: 0,
        committedGoalFundingMinor: 0,
        otherCommitmentsMinor: 0,
      }),
    RangeError,
  );
});
