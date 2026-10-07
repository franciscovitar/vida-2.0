export type FinanceDataState = 'ready' | 'review' | 'partial' | 'unavailable';

export interface FinanceDataStateReport {
  reviewRequiredTransactions: number;
  unknownRoleTransactions: number;
  unbalancedTransactions: number;
  reconciliation: {
    conflict: number;
    partial: number;
    stale: number;
  };
}

export function resolveFinanceDataState(input: {
  connected: boolean;
  report: FinanceDataStateReport | null;
}): FinanceDataState {
  if (!input.connected) return 'unavailable';
  if (!input.report) return 'partial';

  if (
    input.report.reviewRequiredTransactions > 0 ||
    input.report.unknownRoleTransactions > 0 ||
    input.report.unbalancedTransactions > 0 ||
    input.report.reconciliation.conflict > 0
  ) {
    return 'review';
  }

  if (input.report.reconciliation.partial > 0 || input.report.reconciliation.stale > 0) {
    return 'partial';
  }

  return 'ready';
}
