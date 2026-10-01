import 'server-only';

import {
  buildFinanceCashFlowReport,
  type FinanceCashFlowReport,
} from '@/lib/finance/reporting/cash-flow-core';
import {
  readFinanceSheet,
  type FinanceStoreFailureCode,
} from '@/lib/finance/store/client';

export type FinanceCashFlowSnapshot =
  | { ok: true; report: FinanceCashFlowReport }
  | { ok: false; code: FinanceStoreFailureCode };

export async function getFinanceCashFlowSnapshot(): Promise<FinanceCashFlowSnapshot> {
  const [accounts, importBatches, transactions, postings, reconciliations] =
    await Promise.all([
      readFinanceSheet('accounts'),
      readFinanceSheet('importBatches'),
      readFinanceSheet('transactions'),
      readFinanceSheet('postings'),
      readFinanceSheet('reconciliations'),
    ]);

  const reads = [accounts, importBatches, transactions, postings, reconciliations] as const;
  const failed = reads.find((read) => !read.ok);
  if (failed && !failed.ok) return { ok: false, code: failed.code };

  if (
    !accounts.ok ||
    !importBatches.ok ||
    !transactions.ok ||
    !postings.ok ||
    !reconciliations.ok
  ) {
    return { ok: false, code: 'read-error' };
  }

  return {
    ok: true,
    report: buildFinanceCashFlowReport({
      accounts: accounts.values,
      importBatches: importBatches.values,
      transactions: transactions.values,
      postings: postings.values,
      reconciliations: reconciliations.values,
    }),
  };
}
