import type { NaranjaImportPlan } from '@/lib/finance/importers/naranja-x-plan';

export type NaranjaImportPreflight =
  | {
      ok: true;
      existingAccounts: number;
      appendAccounts: number;
      appendBatches: number;
      appendRawTransactions: number;
    }
  | {
      ok: false;
      reason:
        | 'duplicate-batch'
        | 'duplicate-raw-transaction'
        | 'conflicting-account'
        | 'invalid-existing-store';
      conflictKey?: string;
    };

export interface ExistingFinanceStoreRows {
  accounts: readonly (readonly unknown[])[];
  importBatches: readonly (readonly unknown[])[];
  rawTransactions: readonly (readonly unknown[])[];
}

function rowsById(rows: readonly (readonly unknown[])[]): Map<string, readonly unknown[]> {
  const result = new Map<string, readonly unknown[]>();
  for (const row of rows.slice(1)) {
    const id = String(row[0] ?? '').trim();
    if (!id) continue;
    if (result.has(id)) throw new Error(`Duplicate existing Finance row id: ${id}`);
    result.set(id, row);
  }
  return result;
}

function mutationRows(planPart: NaranjaImportPlan['accounts']): readonly (readonly unknown[])[] {
  return planPart.kind === 'append' ? planPart.rows : [];
}

export function preflightNaranjaImport(
  existing: ExistingFinanceStoreRows,
  plan: NaranjaImportPlan,
): NaranjaImportPreflight {
  let accounts: Map<string, readonly unknown[]>;
  let batches: Map<string, readonly unknown[]>;
  let raws: Map<string, readonly unknown[]>;

  try {
    accounts = rowsById(existing.accounts);
    batches = rowsById(existing.importBatches);
    raws = rowsById(existing.rawTransactions);
  } catch {
    return { ok: false, reason: 'invalid-existing-store' };
  }

  let appendAccounts = 0;
  for (const row of mutationRows(plan.accounts)) {
    const id = String(row[0]);
    const existingRow = accounts.get(id);
    if (!existingRow) {
      appendAccounts += 1;
      continue;
    }

    const stableColumns = [1, 2, 3, 4, 5, 6, 7, 8];
    const conflicts = stableColumns.some(
      (index) => String(existingRow[index] ?? '') !== String(row[index] ?? ''),
    );
    if (conflicts) return { ok: false, reason: 'conflicting-account', conflictKey: id };
  }

  for (const row of mutationRows(plan.importBatches)) {
    const id = String(row[0]);
    if (batches.has(id)) return { ok: false, reason: 'duplicate-batch', conflictKey: id };
  }

  for (const row of mutationRows(plan.rawTransactions)) {
    const id = String(row[0]);
    if (raws.has(id)) {
      return { ok: false, reason: 'duplicate-raw-transaction', conflictKey: id };
    }
  }

  return {
    ok: true,
    existingAccounts: accounts.size,
    appendAccounts,
    appendBatches: mutationRows(plan.importBatches).length,
    appendRawTransactions: mutationRows(plan.rawTransactions).length,
  };
}
