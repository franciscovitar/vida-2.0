export const FINANCE_SHEET_SCHEMA_VERSION = 'finance-sheets-v1.0.0';

export const FINANCE_SHEETS = {
  meta: {
    title: 'Meta',
    headers: ['key', 'value', 'updated_at', 'notes'],
  },
  accounts: {
    title: 'Accounts',
    headers: [
      'id',
      'institution',
      'display_name',
      'account_type',
      'currency',
      'ownership',
      'beneficial_scope',
      'liquidity_class',
      'source_adapter',
      'active',
      'created_at',
      'updated_at',
    ],
  },
  importBatches: {
    title: 'Import Batches',
    headers: [
      'id',
      'account_id',
      'source',
      'period_start',
      'period_end',
      'source_hash',
      'evidence_ref',
      'imported_at',
      'status',
      'row_count',
    ],
  },
  rawTransactions: {
    title: 'Raw Transactions',
    headers: [
      'id',
      'batch_id',
      'account_id',
      'source_transaction_id',
      'occurred_at',
      'description',
      'amount_minor',
      'currency',
      'balance_after_minor',
      'raw_hash',
      'raw_payload_json',
      'created_at',
    ],
  },
  transactions: {
    title: 'Transactions',
    headers: [
      'id',
      'occurred_at',
      'description',
      'status',
      'confidence',
      'review_state',
      'created_at',
      'updated_at',
    ],
  },
  transactionSources: {
    title: 'Transaction Sources',
    headers: ['transaction_id', 'raw_transaction_id', 'primary_source'],
  },
  postings: {
    title: 'Postings',
    headers: [
      'transaction_id',
      'line_no',
      'account_id',
      'amount_minor',
      'currency',
      'category_key',
      'economic_role',
      'memo',
      'created_at',
    ],
  },
  reconciliations: {
    title: 'Reconciliations',
    headers: [
      'id',
      'account_id',
      'as_of',
      'source_balance_minor',
      'ledger_balance_minor',
      'difference_minor',
      'currency',
      'status',
      'evidence_ref',
      'created_at',
    ],
  },
  rules: {
    title: 'Rules',
    headers: [
      'id',
      'priority',
      'match_type',
      'match_value',
      'action_json',
      'active',
      'created_at',
      'updated_at',
    ],
  },
  obligations: {
    title: 'Obligations',
    headers: [
      'id',
      'name',
      'amount_minor',
      'currency',
      'cadence',
      'next_due_at',
      'essential',
      'active',
      'notes',
      'updated_at',
    ],
  },
  goals: {
    title: 'Goals',
    headers: [
      'id',
      'name',
      'target_minor',
      'currency',
      'target_date',
      'priority',
      'status',
      'notes',
      'updated_at',
    ],
  },
  commitments: {
    title: 'Commitments',
    headers: [
      'id',
      'type',
      'reference_id',
      'amount_minor',
      'currency',
      'start_at',
      'end_at',
      'overlap_group',
      'active',
      'updated_at',
    ],
  },
  snapshots: {
    title: 'Snapshots',
    headers: [
      'as_of',
      'eligible_liquidity_minor',
      'protected_reserve_minor',
      'upcoming_obligations_minor',
      'committed_goal_funding_minor',
      'other_commitments_minor',
      'safe_to_spend_minor',
      'shortfall_minor',
      'data_quality',
      'generated_at',
    ],
  },
  interventions: {
    title: 'Interventions',
    headers: [
      'id',
      'strategy_type',
      'user_goal',
      'hypothesis',
      'target_metric',
      'start_at',
      'end_at',
      'status',
      'opt_in_at',
      'reversible',
      'user_friction',
      'user_feedback',
      'result_class',
    ],
  },
  wellbeing: {
    title: 'Wellbeing',
    headers: [
      'id',
      'assessed_at',
      'instrument',
      'instrument_version',
      'score',
      'locale',
      'interpretation_scope',
      'notes',
    ],
  },
  manualIntake: {
    title: 'Manual Intake',
    headers: [
      'capture_id',
      'occurred_at',
      'captured_at',
      'raw_text',
      'direction',
      'amount_minor',
      'currency',
      'category',
      'economic_role',
      'note',
      'status',
      'supersedes_capture_id',
      'source',
      'reconciled_transaction_id',
    ],
  },
  monthlyTargets: {
    title: 'Monthly Targets',
    headers: [
      'month',
      'currency',
      'base_target_minor',
      'active_target_minor',
      'suggested_target_minor',
      'suggestion_status',
      'suggestion_reason',
      'suggestion_source',
      'suggested_at',
      'updated_at',
    ],
  },
} as const;

export type FinanceSheetKey = keyof typeof FINANCE_SHEETS;
export type FinanceSheetScalar = string | number | boolean | null;

export function hasFinanceHeaders(
  values: readonly (readonly unknown[])[],
  expected: readonly string[],
): boolean {
  const actual = values[0] ?? [];
  return (
    actual.length >= expected.length &&
    expected.every((header, index) => String(actual[index] ?? '').trim() === header)
  );
}

export function assertFinanceRowWidth(
  sheet: FinanceSheetKey,
  values: readonly FinanceSheetScalar[],
): void {
  const expected = FINANCE_SHEETS[sheet].headers.length;
  if (values.length !== expected) {
    throw new RangeError(
      `${FINANCE_SHEETS[sheet].title} row must contain exactly ${expected} cells`,
    );
  }
}
