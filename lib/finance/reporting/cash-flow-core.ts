import type { FinanceEconomicRole, FinanceReconciliationStatus } from '@/types/finance';

type SheetRows = readonly (readonly unknown[])[];

export interface FinanceCashFlowMonth {
  month: string;
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  adjustmentMinor: number;
  netMinor: number;
  eventCount: number;
}

export interface FinanceCashFlowCurrencySummary {
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  adjustmentMinor: number;
  netMinor: number;
}

export interface FinanceRoleTotal {
  role: FinanceEconomicRole;
  currency: string;
  count: number;
  totalMinor: number;
}

export interface FinanceMonthlyRoleTotal {
  month: string;
  role: FinanceEconomicRole;
  currency: string;
  count: number;
  totalMinor: number;
}

export interface FinanceCoverageWindow {
  accountId: string;
  displayName: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  batchCount: number;
  sourceRowCount: number;
}

export interface FinanceReconciliationSummary {
  total: number;
  reconciled: number;
  partial: number;
  conflict: number;
  stale: number;
}

export type FinanceRecurringExpenseState = 'probable-current' | 'needs-review' | 'stale-observed';

export interface FinanceRecurringExpenseCandidate {
  label: string;
  currency: string;
  observedMonths: number;
  firstSeenMonth: string;
  lastSeenMonth: string;
  medianMonthlyMinor: number;
  latestMonthlyMinor: number;
  state: FinanceRecurringExpenseState;
}

export interface FinanceCashFlowReport {
  currencies: FinanceCashFlowCurrencySummary[];
  monthly: FinanceCashFlowMonth[];
  roleTotals: FinanceRoleTotal[];
  monthlyRoleTotals: FinanceMonthlyRoleTotal[];
  recurringExpenseCandidates: FinanceRecurringExpenseCandidate[];
  coverage: FinanceCoverageWindow[];
  transactionCount: number;
  resolvedTransactions: number;
  reviewRequiredTransactions: number;
  unknownRoleTransactions: number;
  unbalancedTransactions: number;
  reconciliation: FinanceReconciliationSummary;
  quality: 'ready' | 'attention';
}

export interface FinanceCashFlowRows {
  accounts: SheetRows;
  importBatches: SheetRows;
  transactions: SheetRows;
  postings: SheetRows;
  reconciliations: SheetRows;
}

const INCLUDED_ROLES = new Set<FinanceEconomicRole>([
  'income_work',
  'income_family_support',
  'income_financial',
  'expense_personal',
  'expense_professional',
  'refund_adjustment',
]);

function dataRows(rows: SheetRows): readonly (readonly unknown[])[] {
  return rows.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(occurredAt: string): string {
  return occurredAt.slice(0, 7);
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return '';
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function normalizeRecurringLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericExpenseLabel(value: string): boolean {
  return (
    /^PAGO CON (QR|TARJETA)/.test(value) ||
    /^TRANSFERENCIA/.test(value) ||
    /^IIBB /.test(value) ||
    /^IVA SERVICIOS DIGITALES/.test(value)
  );
}

function isExplicitSubscription(value: string): boolean {
  return /SUSCRIPCION|PARAMOUNT|NETFLIX|SPOTIFY|DISNEY|HBO|YOUTUBE PREMIUM/.test(value);
}

function monthDistance(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  if (!fromYear || !fromMonth || !toYear || !toMonth) return Number.POSITIVE_INFINITY;
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function buildFinanceCashFlowReport(rows: FinanceCashFlowRows): FinanceCashFlowReport {
  const accounts = dataRows(rows.accounts);
  const importBatches = dataRows(rows.importBatches);
  const transactions = dataRows(rows.transactions);
  const postings = dataRows(rows.postings);
  const reconciliations = dataRows(rows.reconciliations);

  const accountById = new Map<
    string,
    { displayName: string; currency: string; ownership: string }
  >();
  const ownedAccountIds = new Set<string>();

  for (const row of accounts) {
    const id = text(row[0]);
    if (!id) continue;
    const record = {
      displayName: text(row[2]) || id,
      currency: text(row[4]),
      ownership: text(row[5]),
    };
    accountById.set(id, record);
    if (record.ownership === 'owned') ownedAccountIds.add(id);
  }

  const transactionById = new Map<
    string,
    { occurredAt: string; reviewState: string; description: string }
  >();
  let resolvedTransactions = 0;
  let reviewRequiredTransactions = 0;

  for (const row of transactions) {
    const id = text(row[0]);
    if (!id) continue;
    const reviewState = text(row[5]);
    transactionById.set(id, {
      occurredAt: text(row[1]),
      reviewState,
      description: text(row[2]),
    });
    if (reviewState === 'resolved') resolvedTransactions += 1;
    if (reviewState === 'review_required') reviewRequiredTransactions += 1;
  }

  const balanceByTransaction = new Map<string, Map<string, number>>();
  const unknownRoleTransactions = new Set<string>();
  const monthly = new Map<string, FinanceCashFlowMonth>();
  const roleTotals = new Map<string, FinanceRoleTotal>();
  const monthlyRoleTotals = new Map<string, FinanceMonthlyRoleTotal>();
  const recurringByDescription = new Map<
    string,
    { label: string; currency: string; monthlyTotals: Map<string, number> }
  >();

  for (const row of postings) {
    const transactionId = text(row[0]);
    const accountId = text(row[2]);
    const postingAmount = amount(row[3]);
    const currency = text(row[4]);
    const role = text(row[6]) as FinanceEconomicRole;

    if (!transactionId || !currency) continue;

    const currencyBalances = balanceByTransaction.get(transactionId) ?? new Map<string, number>();
    currencyBalances.set(currency, (currencyBalances.get(currency) ?? 0) + postingAmount);
    balanceByTransaction.set(transactionId, currencyBalances);

    if (!ownedAccountIds.has(accountId)) continue;
    if (role === 'unknown_review') unknownRoleTransactions.add(transactionId);
    if (!INCLUDED_ROLES.has(role)) continue;

    const transaction = transactionById.get(transactionId);
    if (!transaction?.occurredAt) continue;
    const month = monthKey(transaction.occurredAt);
    const monthlyKey = `${month}|${currency}`;
    const current = monthly.get(monthlyKey) ?? {
      month,
      currency,
      incomeMinor: 0,
      expenseMinor: 0,
      adjustmentMinor: 0,
      netMinor: 0,
      eventCount: 0,
    };

    if (role.startsWith('income_')) current.incomeMinor += postingAmount;
    else if (role === 'refund_adjustment') current.adjustmentMinor += postingAmount;
    else current.expenseMinor += postingAmount;

    current.netMinor += postingAmount;
    current.eventCount += 1;
    monthly.set(monthlyKey, current);

    const monthlyRoleKey = `${month}|${role}|${currency}`;
    const monthlyRoleTotal = monthlyRoleTotals.get(monthlyRoleKey) ?? {
      month,
      role,
      currency,
      count: 0,
      totalMinor: 0,
    };
    monthlyRoleTotal.count += 1;
    monthlyRoleTotal.totalMinor += postingAmount;
    monthlyRoleTotals.set(monthlyRoleKey, monthlyRoleTotal);

    if (role === 'expense_personal' && postingAmount < 0) {
      const normalizedLabel = normalizeRecurringLabel(transaction.description);
      if (normalizedLabel && !isGenericExpenseLabel(normalizedLabel)) {
        const recurringKey = `${normalizedLabel}|${currency}`;
        const recurring = recurringByDescription.get(recurringKey) ?? {
          label: transaction.description,
          currency,
          monthlyTotals: new Map<string, number>(),
        };
        recurring.monthlyTotals.set(
          month,
          (recurring.monthlyTotals.get(month) ?? 0) + Math.abs(postingAmount),
        );
        recurringByDescription.set(recurringKey, recurring);
      }
    }

    const roleKey = `${role}|${currency}`;
    const roleTotal = roleTotals.get(roleKey) ?? {
      role,
      currency,
      count: 0,
      totalMinor: 0,
    };
    roleTotal.count += 1;
    roleTotal.totalMinor += postingAmount;
    roleTotals.set(roleKey, roleTotal);
  }

  let unbalancedTransactions = 0;
  for (const currencyBalances of balanceByTransaction.values()) {
    if ([...currencyBalances.values()].some((value) => value !== 0)) {
      unbalancedTransactions += 1;
    }
  }

  const monthlyRows = [...monthly.values()].sort(
    (left, right) =>
      left.month.localeCompare(right.month) || left.currency.localeCompare(right.currency),
  );

  const currencies = new Map<string, FinanceCashFlowCurrencySummary>();
  for (const row of monthlyRows) {
    const current = currencies.get(row.currency) ?? {
      currency: row.currency,
      incomeMinor: 0,
      expenseMinor: 0,
      adjustmentMinor: 0,
      netMinor: 0,
    };
    current.incomeMinor += row.incomeMinor;
    current.expenseMinor += row.expenseMinor;
    current.adjustmentMinor += row.adjustmentMinor;
    current.netMinor += row.netMinor;
    currencies.set(row.currency, current);
  }

  const coverageByAccount = new Map<
    string,
    { periodStart: string; periodEnd: string; batchCount: number; sourceRowCount: number }
  >();

  for (const row of importBatches) {
    const accountId = text(row[1]);
    if (!accountId) continue;
    const periodStart = text(row[3]);
    const periodEnd = text(row[4]);
    const current = coverageByAccount.get(accountId) ?? {
      periodStart,
      periodEnd,
      batchCount: 0,
      sourceRowCount: 0,
    };
    if (periodStart && (!current.periodStart || periodStart < current.periodStart)) {
      current.periodStart = periodStart;
    }
    if (periodEnd && (!current.periodEnd || periodEnd > current.periodEnd)) {
      current.periodEnd = periodEnd;
    }
    current.batchCount += 1;
    current.sourceRowCount += amount(row[9]);
    coverageByAccount.set(accountId, current);
  }

  const coverage: FinanceCoverageWindow[] = [...coverageByAccount.entries()]
    .map(([accountId, value]) => {
      const account = accountById.get(accountId);
      return {
        accountId,
        displayName: account?.displayName ?? accountId,
        currency: account?.currency ?? '',
        ...value,
      };
    })
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.currency.localeCompare(right.currency),
    );

  const commonCoverageByCurrency = new Map<string, { start: string; end: string }>();
  for (const item of coverage) {
    if (!item.currency || !item.periodStart || !item.periodEnd) continue;
    const current = commonCoverageByCurrency.get(item.currency);
    if (!current) {
      commonCoverageByCurrency.set(item.currency, {
        start: item.periodStart.slice(0, 10),
        end: item.periodEnd.slice(0, 10),
      });
      continue;
    }
    if (item.periodStart.slice(0, 10) > current.start) {
      current.start = item.periodStart.slice(0, 10);
    }
    if (item.periodEnd.slice(0, 10) < current.end) {
      current.end = item.periodEnd.slice(0, 10);
    }
  }

  const recurringExpenseCandidates: FinanceRecurringExpenseCandidate[] = [];
  for (const recurring of recurringByDescription.values()) {
    const commonCoverage = commonCoverageByCurrency.get(recurring.currency);
    if (!commonCoverage || commonCoverage.start > commonCoverage.end) continue;

    const completeMonths = [...recurring.monthlyTotals.entries()]
      .filter(([month]) => {
        const monthStart = `${month}-01`;
        return monthStart >= commonCoverage.start && monthEnd(month) <= commonCoverage.end;
      })
      .sort(([left], [right]) => left.localeCompare(right));

    if (completeMonths.length < 3) continue;

    const firstSeenMonth = completeMonths[0][0];
    const lastSeenMonth = completeMonths.at(-1)?.[0] ?? firstSeenMonth;
    const coverageEndMonth = commonCoverage.end.slice(0, 7);
    const monthsSinceLastSeen = monthDistance(lastSeenMonth, coverageEndMonth);
    const normalizedLabel = normalizeRecurringLabel(recurring.label);

    let state: FinanceRecurringExpenseState = 'stale-observed';
    if (monthsSinceLastSeen <= 1 && isExplicitSubscription(normalizedLabel)) {
      state = 'probable-current';
    } else if (monthsSinceLastSeen <= 2) {
      state = 'needs-review';
    }

    recurringExpenseCandidates.push({
      label: recurring.label,
      currency: recurring.currency,
      observedMonths: completeMonths.length,
      firstSeenMonth,
      lastSeenMonth,
      medianMonthlyMinor: median(completeMonths.map(([, total]) => total)),
      latestMonthlyMinor: completeMonths.at(-1)?.[1] ?? 0,
      state,
    });
  }

  recurringExpenseCandidates.sort(
    (left, right) =>
      right.observedMonths - left.observedMonths ||
      right.lastSeenMonth.localeCompare(left.lastSeenMonth) ||
      left.label.localeCompare(right.label),
  );

  const reconciliation: FinanceReconciliationSummary = {
    total: reconciliations.length,
    reconciled: 0,
    partial: 0,
    conflict: 0,
    stale: 0,
  };
  for (const row of reconciliations) {
    const status = text(row[7]) as FinanceReconciliationStatus;
    if (status === 'reconciled') reconciliation.reconciled += 1;
    if (status === 'partial') reconciliation.partial += 1;
    if (status === 'conflict') reconciliation.conflict += 1;
    if (status === 'stale') reconciliation.stale += 1;
  }

  const quality =
    reviewRequiredTransactions === 0 &&
    unknownRoleTransactions.size === 0 &&
    unbalancedTransactions === 0
      ? 'ready'
      : 'attention';

  return {
    currencies: [...currencies.values()].sort((left, right) => {
      if (left.currency === right.currency) return 0;
      if (left.currency === 'ARS') return -1;
      if (right.currency === 'ARS') return 1;
      return left.currency.localeCompare(right.currency);
    }),
    monthly: monthlyRows,
    roleTotals: [...roleTotals.values()].sort(
      (left, right) =>
        left.currency.localeCompare(right.currency) || left.role.localeCompare(right.role),
    ),
    monthlyRoleTotals: [...monthlyRoleTotals.values()].sort(
      (left, right) =>
        left.month.localeCompare(right.month) ||
        left.currency.localeCompare(right.currency) ||
        left.role.localeCompare(right.role),
    ),
    recurringExpenseCandidates,
    coverage,
    transactionCount: transactions.length,
    resolvedTransactions,
    reviewRequiredTransactions,
    unknownRoleTransactions: unknownRoleTransactions.size,
    unbalancedTransactions,
    reconciliation,
    quality,
  };
}
