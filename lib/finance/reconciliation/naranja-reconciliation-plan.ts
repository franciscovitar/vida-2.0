import type { NaranjaStatementResult } from '@/lib/finance/importers/naranja-x';
import type { FinanceMutation } from '@/lib/finance/store/mutation-core';
import type { FinanceSheetScalar } from '@/lib/finance/store/schema';

type AppendFinanceMutation = Extract<FinanceMutation, { kind: 'append' }>;
type Currency = 'ARS' | 'USD';
type Status = 'reconciled' | 'partial' | 'conflict';

const ACCOUNT_BY_CURRENCY: Record<Currency, string> = {
  ARS: 'finance-account:naranja-x:ars',
  USD: 'finance-account:naranja-x:usd',
};

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface NaranjaReconciliationStatement {
  statementPeriod: string;
  evidenceRef: string;
  parsed: NaranjaStatementResult;
}

export interface NaranjaReconciliationPlan {
  reconciliations: AppendFinanceMutation;
  rowCount: number;
  statusCounts: Record<Status, number>;
}

function requireIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !value.includes('T')) {
    throw new Error('generatedAt must be an ISO timestamp');
  }
  return new Date(parsed).toISOString();
}

function periodBounds(period: string): { start: string; end: string } {
  if (!PERIOD_PATTERN.test(period)) {
    throw new Error('statementPeriod must use YYYY-MM');
  }

  const [yearText, monthText] = period.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    start: `${period}-01`,
    end: `${period}-${String(endDay).padStart(2, '0')}`,
  };
}

function reconciliationRow(
  id: string,
  accountId: string,
  asOf: string,
  sourceBalanceMinor: number,
  ledgerBalanceMinor: number,
  currency: Currency,
  status: Status,
  evidenceRef: string,
  generatedAt: string,
): FinanceSheetScalar[] {
  return [
    id,
    accountId,
    asOf,
    sourceBalanceMinor,
    ledgerBalanceMinor,
    ledgerBalanceMinor - sourceBalanceMinor,
    currency,
    status,
    evidenceRef,
    generatedAt,
  ];
}

export function buildNaranjaReconciliationPlan(
  statementsInput: readonly NaranjaReconciliationStatement[],
  generatedAtInput: string,
): NaranjaReconciliationPlan {
  if (statementsInput.length === 0) {
    throw new Error('Naranja reconciliation plan requires statement evidence');
  }

  const generatedAt = requireIsoTimestamp(generatedAtInput);
  const periods = new Set<string>();
  const statements = [...statementsInput].sort((a, b) =>
    a.statementPeriod.localeCompare(b.statementPeriod),
  );

  for (const statement of statements) {
    periodBounds(statement.statementPeriod);
    if (periods.has(statement.statementPeriod)) {
      throw new Error(`Duplicate Naranja statement period: ${statement.statementPeriod}`);
    }
    periods.add(statement.statementPeriod);
    if (!statement.evidenceRef.trim()) throw new Error('evidenceRef is required');
  }

  const rows: FinanceSheetScalar[][] = [];
  const statusCounts: Record<Status, number> = {
    reconciled: 0,
    partial: 0,
    conflict: 0,
  };

  for (const currency of ['ARS', 'USD'] as const) {
    let previousDerivedClose: number | null = null;

    for (const statement of statements) {
      const section = statement.parsed.sections.find((item) => item.currency === currency);
      if (!section) continue;

      const { start, end } = periodBounds(statement.statementPeriod);
      const accountId = ACCOUNT_BY_CURRENCY[currency];
      const movementDeltaMinor = section.transactions.reduce(
        (total, transaction) => total + transaction.amountMinor,
        0,
      );
      const calculatedClose = section.openingBalanceMinor + movementDeltaMinor;

      if (calculatedClose !== section.derivedClosingBalanceMinor) {
        throw new Error(
          `Naranja ledger movement mismatch for ${statement.statementPeriod} ${currency}`,
        );
      }

      if (previousDerivedClose !== null) {
        const status: Status =
          previousDerivedClose === section.openingBalanceMinor ? 'reconciled' : 'conflict';

        rows.push(
          reconciliationRow(
            `finance-recon:naranja-x:${statement.statementPeriod}:${currency.toLowerCase()}:opening`,
            accountId,
            `${start}T00:00:00.000Z`,
            section.openingBalanceMinor,
            previousDerivedClose,
            currency,
            status,
            statement.evidenceRef,
            generatedAt,
          ),
        );
        statusCounts[status] += 1;
      }

      const sourceClose =
        section.statementClosingBalanceMinor ?? section.derivedClosingBalanceMinor;
      const closingStatus: Status =
        section.statementClosingBalanceMinor === null
          ? 'partial'
          : section.derivedClosingBalanceMinor === section.statementClosingBalanceMinor
            ? 'reconciled'
            : 'conflict';

      rows.push(
        reconciliationRow(
          `finance-recon:naranja-x:${statement.statementPeriod}:${currency.toLowerCase()}:closing`,
          accountId,
          `${end}T23:59:59.999Z`,
          sourceClose,
          section.derivedClosingBalanceMinor,
          currency,
          closingStatus,
          statement.evidenceRef,
          generatedAt,
        ),
      );
      statusCounts[closingStatus] += 1;
      previousDerivedClose = section.derivedClosingBalanceMinor;
    }
  }

  return {
    reconciliations: { kind: 'append', sheet: 'reconciliations', rows },
    rowCount: rows.length,
    statusCounts,
  };
}
