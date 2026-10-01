import 'server-only';

import {
  buildFinancePlanningReadModel,
  FINANCE_PLANNING_POLICY_V1,
  type FinancePlanningReadModel,
} from '@/lib/finance/planning-store-core';
import { readFinanceSheet, type FinanceStoreFailureCode } from '@/lib/finance/store/client';

export type FinancePlanningStoreSnapshot =
  { ok: true; model: FinancePlanningReadModel } | { ok: false; code: FinanceStoreFailureCode };

export async function getFinancePlanningStoreSnapshot(): Promise<FinancePlanningStoreSnapshot> {
  const [accounts, reconciliations, obligations, goals, commitments] = await Promise.all([
    readFinanceSheet('accounts'),
    readFinanceSheet('reconciliations'),
    readFinanceSheet('obligations'),
    readFinanceSheet('goals'),
    readFinanceSheet('commitments'),
  ]);

  const reads = [accounts, reconciliations, obligations, goals, commitments] as const;
  const failed = reads.find((read) => !read.ok);
  if (failed && !failed.ok) return { ok: false, code: failed.code };

  if (!accounts.ok || !reconciliations.ok || !obligations.ok || !goals.ok || !commitments.ok) {
    return { ok: false, code: 'read-error' };
  }

  return {
    ok: true,
    model: buildFinancePlanningReadModel(
      {
        accounts: accounts.values,
        reconciliations: reconciliations.values,
        obligations: obligations.values,
        goals: goals.values,
        commitments: commitments.values,
      },
      {
        asOf: new Date().toISOString(),
        ...FINANCE_PLANNING_POLICY_V1,
      },
    ),
  };
}
