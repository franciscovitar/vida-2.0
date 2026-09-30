import type { FinanceStoreReadiness } from '@/types/finance';

export const FINANCE_TABLES = [
  'finance_accounts',
  'finance_import_batches',
  'finance_transactions',
  'finance_raw_transactions',
  'finance_transaction_sources',
  'finance_postings',
  'finance_reconciliations',
  'finance_rules',
] as const;

export type FinanceTable = (typeof FINANCE_TABLES)[number];
export type FinanceHttpMethod = 'GET' | 'POST' | 'PATCH';

export type ReadyFinanceStore = Extract<FinanceStoreReadiness, { status: 'ready' }>;

export function financeMethodAllowed(
  config: ReadyFinanceStore,
  method: FinanceHttpMethod,
): boolean {
  return method === 'GET' || config.writesEnabled;
}

export function buildFinanceRestUrl(
  config: ReadyFinanceStore,
  table: FinanceTable,
  query?: URLSearchParams,
): URL {
  const url = new URL(`/rest/v1/${table}`, config.baseUrl);
  const params = new URLSearchParams(query);
  params.set('owner_key', `eq.${config.ownerKey}`);
  url.search = params.toString();
  return url;
}

export function withFinanceOwner<T extends Record<string, unknown>>(
  ownerKey: string,
  value: T,
): T & { owner_key: string } {
  return { ...value, owner_key: ownerKey };
}
