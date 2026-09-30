export const SAFE_TO_SPEND_VERSION = 'safe-to-spend-v1.0.0';

export interface SafeToSpendInput {
  /** Liquid money eligible for near-term personal use, in integer minor units. */
  eligibleLiquidityMinor: number;
  /** User-protected reserve that must not be treated as spendable. */
  protectedReserveMinor: number;
  /** Known near-term obligations not already represented in another bucket. */
  upcomingObligationsMinor: number;
  /** Goal funding explicitly committed and not overlapping other buckets. */
  committedGoalFundingMinor: number;
  /** Other explicit, non-overlapping commitments. */
  otherCommitmentsMinor: number;
}

export type SafeToSpendStatus = 'available' | 'fully-committed' | 'shortfall';

export interface SafeToSpendResult {
  version: typeof SAFE_TO_SPEND_VERSION;
  eligibleLiquidityMinor: number;
  protectedReserveMinor: number;
  upcomingObligationsMinor: number;
  committedGoalFundingMinor: number;
  otherCommitmentsMinor: number;
  committedTotalMinor: number;
  rawSafeToSpendMinor: number;
  safeToSpendMinor: number;
  shortfallMinor: number;
  status: SafeToSpendStatus;
}

const FIELDS: readonly (keyof SafeToSpendInput)[] = [
  'eligibleLiquidityMinor',
  'protectedReserveMinor',
  'upcomingObligationsMinor',
  'committedGoalFundingMinor',
  'otherCommitmentsMinor',
];

function assertMinorUnits(field: keyof SafeToSpendInput, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer in minor units`);
  }
}

/**
 * Deterministic capacity calculation.
 *
 * The caller is responsible for supplying non-overlapping commitment buckets.
 * The result is not a recommendation to spend the displayed amount.
 */
export function calculateSafeToSpend(input: Readonly<SafeToSpendInput>): SafeToSpendResult {
  for (const field of FIELDS) {
    assertMinorUnits(field, input[field]);
  }

  const committedTotalMinor =
    input.protectedReserveMinor +
    input.upcomingObligationsMinor +
    input.committedGoalFundingMinor +
    input.otherCommitmentsMinor;

  if (!Number.isSafeInteger(committedTotalMinor)) {
    throw new RangeError('committed total exceeds safe integer range');
  }

  const rawSafeToSpendMinor = input.eligibleLiquidityMinor - committedTotalMinor;
  if (!Number.isSafeInteger(rawSafeToSpendMinor)) {
    throw new RangeError('safe-to-spend result exceeds safe integer range');
  }

  const safeToSpendMinor = Math.max(0, rawSafeToSpendMinor);
  const shortfallMinor = Math.max(0, -rawSafeToSpendMinor);
  const status: SafeToSpendStatus =
    rawSafeToSpendMinor > 0
      ? 'available'
      : rawSafeToSpendMinor === 0
        ? 'fully-committed'
        : 'shortfall';

  return {
    version: SAFE_TO_SPEND_VERSION,
    ...input,
    committedTotalMinor,
    rawSafeToSpendMinor,
    safeToSpendMinor,
    shortfallMinor,
    status,
  };
}
