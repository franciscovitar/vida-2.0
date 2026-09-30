import type { NaranjaCanonicalPlan } from '@/lib/finance/ledger/naranja-canonical-plan';

export type CanonicalPreflightResult =
  | {
      ok: true;
      appendAccounts: number;
      appendTransactions: number;
      appendTransactionSources: number;
      appendPostings: number;
    }
  | {
      ok: false;
      reason:
        | 'existing-canonical-data'
        | 'conflicting-clearing-account'
        | 'invalid-existing-store';
      conflictKey?: string;
    };

export interface CanonicalExistingRows {
  accounts: readonly (readonly unknown[])[];
  transactions: readonly (readonly unknown[])[];
  transactionSources: readonly (readonly unknown[])[];
  postings: readonly (readonly unknown[])[];
}

function dataRows(rows: readonly (readonly unknown[])[]): readonly (readonly unknown[])[] {
  return rows.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
}

function idMap(rows: readonly (readonly unknown[])[]): Map<string, readonly unknown[]> {
  const map = new Map<string, readonly unknown[]>();
  for (const row of dataRows(rows)) {
    const id = String(row[0] ?? '').trim();
    if (!id || map.has(id)) throw new Error('Invalid or duplicate existing account id');
    map.set(id, row);
  }
  return map;
}

function appendRows(planPart: NaranjaCanonicalPlan['accounts']) {
  return planPart.kind === 'append' ? planPart.rows : [];
}

export function preflightNaranjaCanonicalPlan(
  existing: CanonicalExistingRows,
  plan: NaranjaCanonicalPlan,
): CanonicalPreflightResult {
  if (
    dataRows(existing.transactions).length > 0 ||
    dataRows(existing.transactionSources).length > 0 ||
    dataRows(existing.postings).length > 0
  ) {
    return { ok: false, reason: 'existing-canonical-data' };
  }

  let accounts: Map<string, readonly unknown[]>;
  try {
    accounts = idMap(existing.accounts);
  } catch {
    return { ok: false, reason: 'invalid-existing-store' };
  }

  let appendAccounts = 0;
  for (const row of appendRows(plan.accounts)) {
    const id = String(row[0] ?? '');
    const existingRow = accounts.get(id);
    if (!existingRow) {
      appendAccounts += 1;
      continue;
    }

    const stableColumns = [1, 2, 3, 4, 5, 6, 7, 8];
    const conflict = stableColumns.some(
      (index) => String(existingRow[index] ?? '') !== String(row[index] ?? ''),
    );
    if (conflict) {
      return { ok: false, reason: 'conflicting-clearing-account', conflictKey: id };
    }
  }

  return {
    ok: true,
    appendAccounts,
    appendTransactions: appendRows(plan.transactions).length,
    appendTransactionSources: appendRows(plan.transactionSources).length,
    appendPostings: appendRows(plan.postings).length,
  };
}
