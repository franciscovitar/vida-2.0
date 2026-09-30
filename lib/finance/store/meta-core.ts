import { FINANCE_SHEET_SCHEMA_VERSION } from '@/lib/finance/store/schema';

export type FinanceMetaStatus =
  | { ok: true; schemaVersion: string; declaredWritesEnabled: boolean }
  | { ok: false; reason: 'missing-meta' | 'schema-mismatch' | 'invalid-writes-flag' };

export function validateFinanceMeta(values: readonly (readonly unknown[])[]): FinanceMetaStatus {
  if (values.length < 2) return { ok: false, reason: 'missing-meta' };

  const rows = new Map<string, string>();
  for (const row of values.slice(1)) {
    const key = String(row[0] ?? '').trim();
    if (!key) continue;
    rows.set(key, String(row[1] ?? '').trim());
  }

  const schemaVersion = rows.get('schema_version');
  if (schemaVersion !== FINANCE_SHEET_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema-mismatch' };
  }

  const writes = rows.get('writes_enabled');
  if (writes !== 'true' && writes !== 'false') {
    return { ok: false, reason: 'invalid-writes-flag' };
  }

  return {
    ok: true,
    schemaVersion,
    declaredWritesEnabled: writes === 'true',
  };
}
