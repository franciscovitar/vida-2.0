import 'server-only';

import {
  buildFinanceMovementsModel,
  type FinanceMovementsModel,
} from '@/lib/finance/movements-core';
import { readFinanceSheet, type FinanceStoreFailureCode } from '@/lib/finance/store/client';

export type FinanceMovementsSnapshot =
  { ok: true; model: FinanceMovementsModel } | { ok: false; code: FinanceStoreFailureCode };

export async function getFinanceMovementsSnapshot(): Promise<FinanceMovementsSnapshot> {
  const [accounts, transactions, postings, manualIntake] = await Promise.all([
    readFinanceSheet('accounts'),
    readFinanceSheet('transactions'),
    readFinanceSheet('postings'),
    readFinanceSheet('manualIntake'),
  ]);

  const reads = [accounts, transactions, postings, manualIntake] as const;
  const failed = reads.find((read) => !read.ok);
  if (failed && !failed.ok) return { ok: false, code: failed.code };

  if (!accounts.ok || !transactions.ok || !postings.ok || !manualIntake.ok) {
    return { ok: false, code: 'read-error' };
  }

  return {
    ok: true,
    model: buildFinanceMovementsModel({
      accounts: accounts.values,
      transactions: transactions.values,
      postings: postings.values,
      manualIntake: manualIntake.values,
    }),
  };
}
