import { createHash } from 'node:crypto';

import type { FinanceMutation } from '@/lib/finance/store/mutation-core';
import type {
  NaranjaCurrency,
  NaranjaSectionResult,
  NaranjaStatementResult,
} from '@/lib/finance/importers/naranja-x';

const SOURCE_HASH_PATTERN = /^[0-9a-f]{64}$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const ACCOUNT_BY_CURRENCY: Record<NaranjaCurrency, string> = {
  ARS: 'finance-account:naranja-x:ars',
  USD: 'finance-account:naranja-x:usd',
};

export interface NaranjaImportPlanInput {
  statementPeriod: string;
  sourceHash: string;
  evidenceRef: string;
  generatedAt: string;
  parsed: NaranjaStatementResult;
}

export interface NaranjaImportSectionSummary {
  currency: NaranjaCurrency;
  accountId: string;
  batchId: string;
  uniqueTransactions: number;
  duplicateRowsDetected: number;
  statementClosed: boolean;
  parserReconciliationDifferenceMinor: number | null;
}

export interface NaranjaImportPlan {
  statementPeriod: string;
  sourceHash: string;
  accounts: FinanceMutation;
  importBatches: FinanceMutation;
  rawTransactions: FinanceMutation;
  sections: NaranjaImportSectionSummary[];
  totalRawTransactions: number;
}

function stableHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !value.includes('T')) {
    throw new Error('generatedAt must be an ISO timestamp');
  }
  return new Date(parsed).toISOString();
}

function requireStatementPeriod(value: string): string {
  if (!PERIOD_PATTERN.test(value)) {
    throw new Error('statementPeriod must use YYYY-MM');
  }
  return value;
}

function requireSourceHash(value: string): string {
  const normalized = value.toLowerCase();
  if (!SOURCE_HASH_PATTERN.test(normalized)) {
    throw new Error('sourceHash must be a lowercase SHA-256 hex digest');
  }
  return normalized;
}

function periodBounds(period: string): { start: string; end: string } {
  const [yearText, monthText] = period.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const start = `${period}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = `${yearText}-${monthText}-${String(endDate.getUTCDate()).padStart(2, '0')}`;
  return { start, end };
}

function accountRow(currency: NaranjaCurrency, generatedAt: string) {
  const id = ACCOUNT_BY_CURRENCY[currency];
  return [
    id,
    'Naranja X',
    currency === 'ARS' ? 'Naranja X ARS' : 'Naranja X USD',
    'wallet',
    currency,
    'owned',
    'personal',
    'immediate',
    'naranja-x-v1',
    true,
    generatedAt,
    generatedAt,
  ] as const;
}

function batchId(period: string, currency: NaranjaCurrency, sourceHash: string): string {
  return `finance-import:naranja-x:${period}:${currency.toLowerCase()}:${sourceHash.slice(0, 16)}`;
}

function rawTransactionId(currency: NaranjaCurrency, sourceTransactionId: string): string {
  return `finance-raw:naranja-x:${currency.toLowerCase()}:${sourceTransactionId}`;
}

function buildRawPayload(section: NaranjaSectionResult, index: number): string {
  const transaction = section.transactions[index];
  return JSON.stringify({
    sourceTransactionId: transaction.sourceTransactionId,
    occurredOn: transaction.occurredOn,
    description: transaction.description,
    sourceAmountMinor: transaction.sourceAmountMinor,
    amountMinor: transaction.amountMinor,
    balanceAfterMinor: transaction.balanceAfterMinor,
    currency: transaction.currency,
  });
}

export function buildNaranjaImportPlan(input: NaranjaImportPlanInput): NaranjaImportPlan {
  const statementPeriod = requireStatementPeriod(input.statementPeriod);
  const sourceHash = requireSourceHash(input.sourceHash);
  const generatedAt = requireIsoTimestamp(input.generatedAt);
  const evidenceRef = input.evidenceRef.trim();
  if (!evidenceRef) throw new Error('evidenceRef is required');

  if (input.parsed.sections.length === 0) {
    throw new Error('Naranja X import plan requires at least one parsed section');
  }

  const currencies = new Set<NaranjaCurrency>();
  for (const section of input.parsed.sections) {
    if (currencies.has(section.currency)) {
      throw new Error(`Duplicate Naranja X currency section: ${section.currency}`);
    }
    currencies.add(section.currency);
  }

  const { start, end } = periodBounds(statementPeriod);
  const accountRows = input.parsed.sections.map((section) =>
    accountRow(section.currency, generatedAt),
  );
  const batchRows: (string | number | boolean | null)[][] = [];
  const rawRows: (string | number | boolean | null)[][] = [];
  const sections: NaranjaImportSectionSummary[] = [];

  for (const section of input.parsed.sections) {
    const accountId = ACCOUNT_BY_CURRENCY[section.currency];
    const id = batchId(statementPeriod, section.currency, sourceHash);

    batchRows.push([
      id,
      accountId,
      'naranja-x',
      start,
      end,
      sourceHash,
      evidenceRef,
      generatedAt,
      section.statementClosed ? 'parsed' : 'pending',
      section.transactions.length,
    ]);

    section.transactions.forEach((transaction, index) => {
      const payload = buildRawPayload(section, index);
      rawRows.push([
        rawTransactionId(section.currency, transaction.sourceTransactionId),
        id,
        accountId,
        transaction.sourceTransactionId,
        `${transaction.occurredOn}T12:00:00.000Z`,
        transaction.description,
        transaction.amountMinor,
        transaction.currency,
        transaction.balanceAfterMinor,
        stableHash(payload),
        payload,
        generatedAt,
      ]);
    });

    sections.push({
      currency: section.currency,
      accountId,
      batchId: id,
      uniqueTransactions: section.transactions.length,
      duplicateRowsDetected: section.duplicateSourceTransactionIds.length,
      statementClosed: section.statementClosed,
      parserReconciliationDifferenceMinor: section.reconciliationDifferenceMinor,
    });
  }

  return {
    statementPeriod,
    sourceHash,
    accounts: { kind: 'append', sheet: 'accounts', rows: accountRows },
    importBatches: { kind: 'append', sheet: 'importBatches', rows: batchRows },
    rawTransactions: { kind: 'append', sheet: 'rawTransactions', rows: rawRows },
    sections,
    totalRawTransactions: rawRows.length,
  };
}

export function naranjaImportPlanMutations(plan: NaranjaImportPlan): readonly FinanceMutation[] {
  return [plan.accounts, plan.importBatches, plan.rawTransactions];
}
