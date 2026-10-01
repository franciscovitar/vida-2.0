import {
  buildFinancePlanningSnapshot,
  type FinancePlanningCommitment,
  type FinancePlanningSnapshot,
} from '@/lib/finance/planning-core';

export const FINANCE_PLANNING_DRAFT_VERSION = 'finance-planning-draft-v1.0.0';

export interface FinancePlanningDraftInput {
  asOf: string;
  currency: string;
  eligibleLiquidityMinor: number;
  protectedReserveMinor: number;
  upcomingObligationsMinor: number;
  committedGoalFundingMinor: number;
  otherCommitmentsMinor: number;
  essentialMonthlyBurnMinor: number | null;
  nonOverlappingConfirmed: boolean;
}

export interface FinancePlanningDraftResult {
  version: typeof FINANCE_PLANNING_DRAFT_VERSION;
  snapshot: FinancePlanningSnapshot;
}

function commitment(
  bucket: FinancePlanningCommitment['bucket'],
  amountMinor: number,
  currency: string,
): FinancePlanningCommitment {
  return {
    id: `draft:${bucket}`,
    label: `Borrador ${bucket}`,
    bucket,
    amountMinor,
    currency,
    overlapGroup: null,
  };
}

export function buildFinancePlanningDraft(
  input: Readonly<FinancePlanningDraftInput>,
): FinancePlanningDraftResult {
  if (!input.nonOverlappingConfirmed) {
    throw new RangeError('draft commitments must be explicitly confirmed as non-overlapping');
  }

  const commitments: FinancePlanningCommitment[] = [
    commitment('reserve', input.protectedReserveMinor, input.currency),
  ];

  if (input.upcomingObligationsMinor > 0) {
    commitments.push(commitment('obligation', input.upcomingObligationsMinor, input.currency));
  }
  if (input.committedGoalFundingMinor > 0) {
    commitments.push(commitment('goal', input.committedGoalFundingMinor, input.currency));
  }
  if (input.otherCommitmentsMinor > 0) {
    commitments.push(commitment('other', input.otherCommitmentsMinor, input.currency));
  }

  return {
    version: FINANCE_PLANNING_DRAFT_VERSION,
    snapshot: buildFinancePlanningSnapshot({
      asOf: input.asOf,
      currency: input.currency,
      eligibleLiquidityMinor: input.eligibleLiquidityMinor,
      commitments,
      essentialMonthlyBurnMinor: input.essentialMonthlyBurnMinor,
    }),
  };
}
