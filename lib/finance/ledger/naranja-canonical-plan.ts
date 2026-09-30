import type { FinanceMutation } from '@/lib/finance/store/mutation-core';
import type { FinanceSheetScalar } from '@/lib/finance/store/schema';

export interface CanonicalRawTransaction {
  id: string;
  batchId: string;
  accountId: string;
  sourceTransactionId: string;
  occurredAt: string;
  description: string;
  amountMinor: number;
  currency: 'ARS' | 'USD';
  rawHash: string;
}

type AppendFinanceMutation = Extract<FinanceMutation, { kind: 'append' }>;

export interface NaranjaCanonicalPlan {
  accounts: AppendFinanceMutation;
  transactions: AppendFinanceMutation;
  transactionSources: AppendFinanceMutation;
  postings: AppendFinanceMutation;
  transactionCount: number;
  postingCount: number;
}

const CLEARING_ACCOUNT_BY_CURRENCY = {
  ARS: 'finance-account:system:unclassified:ars',
  USD: 'finance-account:system:unclassified:usd',
} as const;

function canonicalTransactionId(raw: CanonicalRawTransaction): string {
  return `finance-tx:naranja-x:${raw.currency.toLowerCase()}:${raw.sourceTransactionId}`;
}

function requireSafeMinorUnits(value: number): number {
  if (!Number.isSafeInteger(value) || value === 0) {
    throw new RangeError('Canonical raw amount_minor must be a non-zero safe integer');
  }
  return value;
}

function requireIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Raw occurred_at must be an ISO timestamp');
  return new Date(parsed).toISOString();
}

function clearingAccountRow(
  currency: 'ARS' | 'USD',
  generatedAt: string,
): readonly FinanceSheetScalar[] {
  return [
    CLEARING_ACCOUNT_BY_CURRENCY[currency],
    'Finance OS',
    `Unclassified ${currency}`,
    'clearing',
    currency,
    'clearing',
    'mixed',
    'illiquid',
    'system',
    true,
    generatedAt,
    generatedAt,
  ];
}

export function buildNaranjaCanonicalPlan(
  rawTransactions: readonly CanonicalRawTransaction[],
  generatedAtInput: string,
): NaranjaCanonicalPlan {
  const generatedAt = requireIsoTimestamp(generatedAtInput);
  if (rawTransactions.length === 0) {
    throw new Error('Canonical Naranja plan requires at least one raw transaction');
  }

  const rawIds = new Set<string>();
  const txIds = new Set<string>();
  const currencies = new Set<'ARS' | 'USD'>();

  const transactionRows: FinanceSheetScalar[][] = [];
  const sourceRows: FinanceSheetScalar[][] = [];
  const postingRows: FinanceSheetScalar[][] = [];

  for (const raw of rawTransactions) {
    if (!raw.id.startsWith('finance-raw:naranja-x:')) {
      throw new Error(`Unsupported raw source id: ${raw.id}`);
    }
    if (rawIds.has(raw.id)) throw new Error(`Duplicate raw id: ${raw.id}`);
    rawIds.add(raw.id);

    const amountMinor = requireSafeMinorUnits(raw.amountMinor);
    const occurredAt = requireIsoTimestamp(raw.occurredAt);
    const txId = canonicalTransactionId(raw);
    if (txIds.has(txId)) throw new Error(`Duplicate canonical transaction id: ${txId}`);
    txIds.add(txId);
    currencies.add(raw.currency);

    const clearingAccountId = CLEARING_ACCOUNT_BY_CURRENCY[raw.currency];

    transactionRows.push([
      txId,
      occurredAt,
      raw.description,
      'posted',
      1,
      'review_required',
      generatedAt,
      generatedAt,
    ]);

    sourceRows.push([txId, raw.id, true]);

    postingRows.push([
      txId,
      1,
      raw.accountId,
      amountMinor,
      raw.currency,
      null,
      'unknown_review',
      'source_account_movement',
      generatedAt,
    ]);

    postingRows.push([
      txId,
      2,
      clearingAccountId,
      -amountMinor,
      raw.currency,
      null,
      'unknown_review',
      'unclassified_contra',
      generatedAt,
    ]);
  }

  for (const txId of txIds) {
    const postings = postingRows.filter((row) => row[0] === txId);
    const currenciesForTx = new Set(postings.map((row) => row[4]));
    const sum = postings.reduce((total, row) => total + Number(row[3]), 0);
    if (postings.length !== 2 || currenciesForTx.size !== 1 || sum !== 0) {
      throw new Error(`Unbalanced canonical transaction: ${txId}`);
    }
  }

  const accountRows = [...currencies]
    .sort()
    .map((currency) => clearingAccountRow(currency, generatedAt));

  return {
    accounts: { kind: 'append', sheet: 'accounts', rows: accountRows },
    transactions: { kind: 'append', sheet: 'transactions', rows: transactionRows },
    transactionSources: {
      kind: 'append',
      sheet: 'transactionSources',
      rows: sourceRows,
    },
    postings: { kind: 'append', sheet: 'postings', rows: postingRows },
    transactionCount: transactionRows.length,
    postingCount: postingRows.length,
  };
}

export function naranjaCanonicalPlanMutations(
  plan: NaranjaCanonicalPlan,
): readonly FinanceMutation[] {
  return [plan.accounts, plan.transactions, plan.transactionSources, plan.postings];
}
