import { calculateSafeToSpend, type SafeToSpendResult } from '@/lib/finance/safe-to-spend';

export const FINANCE_PLANNING_VERSION = 'finance-planning-v1.0.0';

export type FinancePlanningBucket = 'reserve' | 'obligation' | 'goal' | 'other';

export interface FinancePlanningCommitment {
  id: string;
  label: string;
  bucket: FinancePlanningBucket;
  amountMinor: number;
  currency: string;
  /**
   * Null means this amount is known to be independent from the other commitments.
   * Reusing a non-null group is rejected so overlapping reservations cannot be double-counted.
   */
  overlapGroup: string | null;
}

export interface FinancePlanningInput {
  asOf: string;
  currency: string;
  eligibleLiquidityMinor: number;
  commitments: readonly FinancePlanningCommitment[];
  essentialMonthlyBurnMinor?: number | null;
}

export interface FinancePlanningCommitmentSummary {
  count: number;
  protectedReserveMinor: number;
  upcomingObligationsMinor: number;
  committedGoalFundingMinor: number;
  otherCommitmentsMinor: number;
}

export interface FinanceResilienceSnapshot {
  eligibleLiquidityMinor: number;
  protectedReserveMinor: number;
  upcomingObligationsMinor: number;
  essentialMonthlyBurnMinor: number | null;
  reserveCoverageMonths: number | null;
  essentialCoverageMonths: number | null;
}

export interface FinancePlanningSnapshot {
  version: typeof FINANCE_PLANNING_VERSION;
  asOf: string;
  currency: string;
  commitments: FinancePlanningCommitmentSummary;
  safeToSpend: SafeToSpendResult;
  resilience: FinanceResilienceSnapshot;
}

export type PurchaseCapacityState =
  | 'within-safe-capacity'
  | 'uses-protected-capacity'
  | 'exceeds-liquidity';

export interface FinancePurchaseScenario {
  version: typeof FINANCE_PLANNING_VERSION;
  currency: string;
  purchaseAmountMinor: number;
  preSafeToSpendMinor: number;
  postEligibleLiquidityMinor: number;
  postRawSafeToSpendMinor: number;
  postSafeToSpendMinor: number;
  postShortfallMinor: number;
  beyondSafeCapacityMinor: number;
  exceedsEligibleLiquidityByMinor: number;
  capacityState: PurchaseCapacityState;
}

function assertMinorUnits(field: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer in minor units`);
  }
}

function requireText(field: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${field} must not be empty`);
  return normalized;
}

function normalizeCurrency(value: string): string {
  return requireText('currency', value).toUpperCase();
}

function coverageMonths(
  amountMinor: number,
  essentialMonthlyBurnMinor: number | null,
): number | null {
  if (essentialMonthlyBurnMinor === null || essentialMonthlyBurnMinor === 0) return null;
  return amountMinor / essentialMonthlyBurnMinor;
}

export function buildFinancePlanningSnapshot(
  input: Readonly<FinancePlanningInput>,
): FinancePlanningSnapshot {
  const currency = normalizeCurrency(input.currency);
  const asOf = requireText('asOf', input.asOf);
  assertMinorUnits('eligibleLiquidityMinor', input.eligibleLiquidityMinor);

  const essentialMonthlyBurnMinor = input.essentialMonthlyBurnMinor ?? null;
  if (essentialMonthlyBurnMinor !== null) {
    assertMinorUnits('essentialMonthlyBurnMinor', essentialMonthlyBurnMinor);
  }

  const seenIds = new Set<string>();
  const seenOverlapGroups = new Set<string>();
  const summary: FinancePlanningCommitmentSummary = {
    count: 0,
    protectedReserveMinor: 0,
    upcomingObligationsMinor: 0,
    committedGoalFundingMinor: 0,
    otherCommitmentsMinor: 0,
  };

  for (const commitment of input.commitments) {
    const id = requireText('commitment.id', commitment.id);
    if (seenIds.has(id)) throw new RangeError(`duplicate commitment id: ${id}`);
    seenIds.add(id);

    const commitmentCurrency = normalizeCurrency(commitment.currency);
    if (commitmentCurrency !== currency) {
      throw new RangeError(`commitment ${id} currency must match planning currency ${currency}`);
    }

    assertMinorUnits(`commitment ${id} amountMinor`, commitment.amountMinor);

    const overlapGroup = commitment.overlapGroup?.trim() || null;
    if (overlapGroup) {
      if (seenOverlapGroups.has(overlapGroup)) {
        throw new RangeError(
          `overlap group ${overlapGroup} contains multiple commitments; resolve overlap before calculation`,
        );
      }
      seenOverlapGroups.add(overlapGroup);
    }

    summary.count += 1;
    if (commitment.bucket === 'reserve') {
      summary.protectedReserveMinor += commitment.amountMinor;
    } else if (commitment.bucket === 'obligation') {
      summary.upcomingObligationsMinor += commitment.amountMinor;
    } else if (commitment.bucket === 'goal') {
      summary.committedGoalFundingMinor += commitment.amountMinor;
    } else {
      summary.otherCommitmentsMinor += commitment.amountMinor;
    }
  }

  for (const [field, value] of Object.entries(summary)) {
    if (field !== 'count' && !Number.isSafeInteger(value)) {
      throw new RangeError(`${field} exceeds safe integer range`);
    }
  }

  const safeToSpend = calculateSafeToSpend({
    eligibleLiquidityMinor: input.eligibleLiquidityMinor,
    protectedReserveMinor: summary.protectedReserveMinor,
    upcomingObligationsMinor: summary.upcomingObligationsMinor,
    committedGoalFundingMinor: summary.committedGoalFundingMinor,
    otherCommitmentsMinor: summary.otherCommitmentsMinor,
  });

  return {
    version: FINANCE_PLANNING_VERSION,
    asOf,
    currency,
    commitments: summary,
    safeToSpend,
    resilience: {
      eligibleLiquidityMinor: input.eligibleLiquidityMinor,
      protectedReserveMinor: summary.protectedReserveMinor,
      upcomingObligationsMinor: summary.upcomingObligationsMinor,
      essentialMonthlyBurnMinor,
      reserveCoverageMonths: coverageMonths(
        summary.protectedReserveMinor,
        essentialMonthlyBurnMinor,
      ),
      essentialCoverageMonths: coverageMonths(
        input.eligibleLiquidityMinor,
        essentialMonthlyBurnMinor,
      ),
    },
  };
}

export function evaluateFinancePurchaseScenario(
  snapshot: Readonly<FinancePlanningSnapshot>,
  purchaseAmountMinor: number,
): FinancePurchaseScenario {
  assertMinorUnits('purchaseAmountMinor', purchaseAmountMinor);

  const postEligibleLiquidityMinor =
    snapshot.safeToSpend.eligibleLiquidityMinor - purchaseAmountMinor;
  if (!Number.isSafeInteger(postEligibleLiquidityMinor)) {
    throw new RangeError('post-purchase liquidity exceeds safe integer range');
  }

  const postRawSafeToSpendMinor = snapshot.safeToSpend.rawSafeToSpendMinor - purchaseAmountMinor;
  if (!Number.isSafeInteger(postRawSafeToSpendMinor)) {
    throw new RangeError('post-purchase safe-to-spend exceeds safe integer range');
  }

  const postSafeToSpendMinor = Math.max(0, postRawSafeToSpendMinor);
  const postShortfallMinor = Math.max(0, -postRawSafeToSpendMinor);
  const beyondSafeCapacityMinor = Math.max(
    0,
    purchaseAmountMinor - snapshot.safeToSpend.safeToSpendMinor,
  );
  const exceedsEligibleLiquidityByMinor = Math.max(0, -postEligibleLiquidityMinor);
  const capacityState: PurchaseCapacityState =
    exceedsEligibleLiquidityByMinor > 0
      ? 'exceeds-liquidity'
      : beyondSafeCapacityMinor > 0
      ? 'uses-protected-capacity'
      : 'within-safe-capacity';

  return {
    version: FINANCE_PLANNING_VERSION,
    currency: snapshot.currency,
    purchaseAmountMinor,
    preSafeToSpendMinor: snapshot.safeToSpend.safeToSpendMinor,
    postEligibleLiquidityMinor,
    postRawSafeToSpendMinor,
    postSafeToSpendMinor,
    postShortfallMinor,
    beyondSafeCapacityMinor,
    exceedsEligibleLiquidityByMinor,
    capacityState,
  };
}
