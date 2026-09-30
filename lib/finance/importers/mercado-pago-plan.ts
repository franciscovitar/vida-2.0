import { createHash } from 'node:crypto';

import type { MercadoPagoStatementResult } from '@/lib/finance/importers/mercado-pago';
import type { FinanceMutation } from '@/lib/finance/store/mutation-core';
import type { FinanceSheetScalar } from '@/lib/finance/store/schema';

type AppendFinanceMutation = Extract<FinanceMutation, { kind: 'append' }>;

const ACCOUNT_ID = 'finance-account:mercado-pago:ars';
const SOURCE_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface MercadoPagoImportEvidence {
  sourceHash: string;
  evidenceRef: string;
  parsed: MercadoPagoStatementResult;
}

export interface MercadoPagoImportPlan {
  accounts: AppendFinanceMutation;
  importBatches: AppendFinanceMutation;
  rawTransactions: AppendFinanceMutation;
  statementCount: number;
  rawTransactionCount: number;
}

function requireIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !value.includes('T')) {
    throw new Error('generatedAt must be an ISO timestamp');
  }
  return new Date(parsed).toISOString();
}

function requireSourceHash(value: string): string {
  const normalized = value.toLowerCase();
  if (!SOURCE_HASH_PATTERN.test(normalized)) {
    throw new Error('sourceHash must be a lowercase SHA-256 hex digest');
  }
  return normalized;
}

function periodBounds(period: string): { start: string; end: string } {
  const match = period.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) throw new Error('statementPeriod must use YYYY-MM');

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    start: `${period}-01`,
    end: `${period}-${String(endDay).padStart(2, '0')}`,
  };
}

function accountRow(generatedAt: string): readonly FinanceSheetScalar[] {
  return [
    ACCOUNT_ID,
    'Mercado Pago',
    'Mercado Pago Wallet',
    'wallet',
    'ARS',
    'owned',
    'mixed',
    'immediate',
    'mercado-pago-wallet-v1',
    true,
    generatedAt,
    generatedAt,
  ];
}

function batchId(period: string, sourceHash: string): string {
  return `finance-import:mercado-pago:${period}:ars:${sourceHash.slice(0, 16)}`;
}

function rawId(sourceTransactionId: string): string {
  return `finance-raw:mercado-pago:ars:${sourceTransactionId}`;
}

function stableRawPayload(transaction: MercadoPagoStatementResult['transactions'][number]): string {
  return JSON.stringify({
    sourceTransactionId: transaction.sourceTransactionId,
    occurredOn: transaction.occurredOn,
    description: transaction.description,
    amountMinor: transaction.amountMinor,
    balanceAfterMinor: transaction.balanceAfterMinor,
    currency: transaction.currency,
  });
}

export function buildMercadoPagoImportPlan(
  evidenceInput: readonly MercadoPagoImportEvidence[],
  generatedAtInput: string,
): MercadoPagoImportPlan {
  if (evidenceInput.length === 0) {
    throw new Error('Mercado Pago import plan requires statement evidence');
  }

  const generatedAt = requireIsoTimestamp(generatedAtInput);
  const evidence = [...evidenceInput].sort((a, b) =>
    a.parsed.statementPeriod.localeCompare(b.parsed.statementPeriod),
  );

  const periods = new Set<string>();
  const sourceTransactionIds = new Set<string>();
  const batchRows: FinanceSheetScalar[][] = [];
  const rawRows: FinanceSheetScalar[][] = [];

  for (const item of evidence) {
    const period = item.parsed.statementPeriod;
    const sourceHash = requireSourceHash(item.sourceHash);
    const evidenceRef = item.evidenceRef.trim();
    if (!evidenceRef) throw new Error('evidenceRef is required');
    if (periods.has(period)) {
      throw new Error(`Duplicate Mercado Pago statement period: ${period}`);
    }
    periods.add(period);

    const { start, end } = periodBounds(period);
    const id = batchId(period, sourceHash);

    batchRows.push([
      id,
      ACCOUNT_ID,
      'mercado-pago-wallet',
      start,
      end,
      sourceHash,
      evidenceRef,
      generatedAt,
      'parsed',
      item.parsed.transactions.length,
    ]);

    for (const transaction of item.parsed.transactions) {
      if (sourceTransactionIds.has(transaction.sourceTransactionId)) {
        throw new Error(
          `Duplicate Mercado Pago operation across statements: ${transaction.sourceTransactionId}`,
        );
      }
      sourceTransactionIds.add(transaction.sourceTransactionId);

      const payload = stableRawPayload(transaction);
      rawRows.push([
        rawId(transaction.sourceTransactionId),
        id,
        ACCOUNT_ID,
        transaction.sourceTransactionId,
        `${transaction.occurredOn}T12:00:00.000Z`,
        transaction.description,
        transaction.amountMinor,
        'ARS',
        transaction.balanceAfterMinor,
        createHash('sha256').update(payload, 'utf8').digest('hex'),
        payload,
        generatedAt,
      ]);
    }
  }

  return {
    accounts: { kind: 'append', sheet: 'accounts', rows: [accountRow(generatedAt)] },
    importBatches: { kind: 'append', sheet: 'importBatches', rows: batchRows },
    rawTransactions: { kind: 'append', sheet: 'rawTransactions', rows: rawRows },
    statementCount: batchRows.length,
    rawTransactionCount: rawRows.length,
  };
}

export function mercadoPagoImportPlanMutations(
  plan: MercadoPagoImportPlan,
): readonly FinanceMutation[] {
  return [plan.accounts, plan.importBatches, plan.rawTransactions];
}
