export type FinanceStoreMode = 'disabled' | 'supabase-rest';

export type FinanceStoreReadiness =
  | { status: 'disabled' }
  | { status: 'not-configured'; issue: FinanceStoreConfigIssue }
  | {
      status: 'ready';
      mode: 'supabase-rest';
      baseUrl: string;
      serviceRoleKey: string;
      ownerKey: string;
      writesEnabled: boolean;
    };

export type FinanceStoreConfigIssue =
  | 'invalid-mode'
  | 'missing-url'
  | 'invalid-url'
  | 'missing-service-role-key'
  | 'missing-owner-key'
  | 'invalid-owner-key';

export type FinanceAccountType =
  | 'bank'
  | 'wallet'
  | 'cash'
  | 'credit_card'
  | 'liability'
  | 'clearing';

export type FinanceOwnership = 'owned' | 'shared' | 'external_liability' | 'clearing';

export type FinanceBeneficialScope =
  | 'personal'
  | 'business_pass_through'
  | 'family_pass_through'
  | 'mixed';

export type FinanceLiquidityClass = 'immediate' | 'near_term' | 'illiquid' | 'liability';

export type FinanceEconomicRole =
  | 'income_work'
  | 'income_family_support'
  | 'expense_personal'
  | 'expense_professional'
  | 'reimbursement'
  | 'internal_transfer'
  | 'liability_settlement'
  | 'business_pass_through'
  | 'family_pass_through'
  | 'refund_adjustment'
  | 'unknown_review';

export type FinanceReviewState = 'resolved' | 'review_required' | 'not_applicable';
export type FinanceReconciliationStatus = 'reconciled' | 'partial' | 'conflict' | 'stale';
