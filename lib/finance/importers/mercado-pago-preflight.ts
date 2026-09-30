import type { MercadoPagoImportPlan } from '@/lib/finance/importers/mercado-pago-plan';

export type MercadoPagoImportPreflight =
  | {
      ok: true;
      appendAccounts: number;
      appendBatches: number;
      appendRawTransactions: number;
    }
  | {
      ok: false;
      reason:
        | 'conflicting-account'
        | 'duplicate-batch'
        | 'duplicate-raw-transaction'
        | 'invalid-existing-store';
      conflictKey?: string;
    };

export interface MercadoPagoExistingStoreRows {
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

export function preflightMercadoPagoImport(
  existing: MercadoPagoExistingStoreRows,
  plan: MercadoPagoImportPlan,
): MercadoPagoImportPreflight {
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

  const accountRows = plan.accounts.rows;
  let appendAccounts = 0;

  for (const row of accountRows) {
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
      return { ok: false, reason: 'conflicting-account', conflictKey: id };
    }
  }

  for (const row of plan.importBatches.rows) {
    const id = String(row[0] ?? '');
    if (batches.has(id)) {
      return { ok: false, reason: 'duplicate-batch', conflictKey: id };
    }
  }

  for (const row of plan.rawTransactions.rows) {
    const id = String(row[0] ?? '');
    if (raws.has(id)) {
      return { ok: false, reason: 'duplicate-raw-transaction', conflictKey: id };
    }
  }

  return {
    ok: true,
    appendAccounts,
    appendBatches: plan.importBatches.rows.length,
    appendRawTransactions: plan.rawTransactions.rows.length,
  };
}
