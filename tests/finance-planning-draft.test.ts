import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFinancePlanningDraft } from '@/lib/finance/planning-draft-core';

test('planning draft requires an explicit non-overlap confirmation', () => {
  assert.throws(
    () =>
      buildFinancePlanningDraft({
        asOf: '2026-10-01',
        currency: 'ARS',
        eligibleLiquidityMinor: 1_000_000,
        protectedReserveMinor: 200_000,
        upcomingObligationsMinor: 100_000,
        committedGoalFundingMinor: 50_000,
        otherCommitmentsMinor: 0,
        essentialMonthlyBurnMinor: 250_000,
        nonOverlappingConfirmed: false,
      }),
    /explicitly confirmed as non-overlapping/,
  );
});

test('planning draft preserves an explicit zero reserve instead of treating it as missing', () => {
  const draft = buildFinancePlanningDraft({
    asOf: '2026-10-01',
    currency: 'ARS',
    eligibleLiquidityMinor: 1_000_000,
    protectedReserveMinor: 0,
    upcomingObligationsMinor: 100_000,
    committedGoalFundingMinor: 50_000,
    otherCommitmentsMinor: 25_000,
    essentialMonthlyBurnMinor: 200_000,
    nonOverlappingConfirmed: true,
  });

  assert.equal(draft.snapshot.commitments.protectedReserveMinor, 0);
  assert.equal(draft.snapshot.commitments.upcomingObligationsMinor, 100_000);
  assert.equal(draft.snapshot.commitments.committedGoalFundingMinor, 50_000);
  assert.equal(draft.snapshot.commitments.otherCommitmentsMinor, 25_000);
  assert.equal(draft.snapshot.safeToSpend.safeToSpendMinor, 825_000);
  assert.equal(draft.snapshot.resilience.reserveCoverageMonths, 0);
  assert.equal(draft.snapshot.resilience.essentialCoverageMonths, 5);
});

test('planning draft keeps empty optional buckets out of commitment count', () => {
  const draft = buildFinancePlanningDraft({
    asOf: '2026-10-01',
    currency: 'USD',
    eligibleLiquidityMinor: 10_000,
    protectedReserveMinor: 2_000,
    upcomingObligationsMinor: 0,
    committedGoalFundingMinor: 0,
    otherCommitmentsMinor: 0,
    essentialMonthlyBurnMinor: null,
    nonOverlappingConfirmed: true,
  });

  assert.equal(draft.snapshot.commitments.count, 1);
  assert.equal(draft.snapshot.safeToSpend.safeToSpendMinor, 8_000);
  assert.equal(draft.snapshot.resilience.reserveCoverageMonths, null);
  assert.equal(draft.snapshot.resilience.essentialCoverageMonths, null);
});
