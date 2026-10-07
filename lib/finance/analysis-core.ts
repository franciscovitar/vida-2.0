import type { FinanceEconomicRole } from '@/types/finance';

import type {
  FinanceCashFlowCurrencySummary,
  FinanceCashFlowMonth,
  FinanceCashFlowReport,
  FinanceMonthlyRoleTotal,
  FinanceRoleTotal,
} from '@/lib/finance/reporting/cash-flow-core';

export const FINANCE_ANALYSIS_RANGES = ['3m', '6m', 'ytd', '12m'] as const;

export type FinanceAnalysisRange = (typeof FINANCE_ANALYSIS_RANGES)[number];

export interface FinanceAnalysisView {
  currency: string;
  range: FinanceAnalysisRange;
  windowStartMonth: string;
  windowEndMonth: string;
  observedStartMonth: string;
  observedEndMonth: string;
  expectedMonthCount: number;
  observedMonthCount: number;
  hasMonthGaps: boolean;
  monthly: FinanceCashFlowMonth[];
  monthlyRoleTotals: FinanceMonthlyRoleTotal[];
  roleTotals: FinanceRoleTotal[];
  totals: FinanceCashFlowCurrencySummary;
}

const RANGE_SET = new Set<string>(FINANCE_ANALYSIS_RANGES);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeFinanceAnalysisRange(
  value: string | string[] | undefined,
): FinanceAnalysisRange {
  const candidate = firstValue(value)?.toLowerCase();
  return candidate && RANGE_SET.has(candidate) ? (candidate as FinanceAnalysisRange) : '6m';
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) throw new RangeError('month must use YYYY-MM');
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function rangeStartMonth(latestMonth: string, range: FinanceAnalysisRange): string {
  if (range === '3m') return shiftMonth(latestMonth, -2);
  if (range === '6m') return shiftMonth(latestMonth, -5);
  if (range === '12m') return shiftMonth(latestMonth, -11);
  return `${latestMonth.slice(0, 4)}-01`;
}

function inclusiveMonthCount(startMonth: string, endMonth: string): number {
  const [startYear, startNumber] = startMonth.split('-').map(Number);
  const [endYear, endNumber] = endMonth.split('-').map(Number);
  if (!startYear || !startNumber || !endYear || !endNumber) return 0;
  return (endYear - startYear) * 12 + endNumber - startNumber + 1;
}

function aggregateRoles(rows: readonly FinanceMonthlyRoleTotal[]): FinanceRoleTotal[] {
  const byRole = new Map<FinanceEconomicRole, FinanceRoleTotal>();

  for (const row of rows) {
    const current = byRole.get(row.role) ?? {
      role: row.role,
      currency: row.currency,
      count: 0,
      totalMinor: 0,
    };
    current.count += row.count;
    current.totalMinor += row.totalMinor;
    byRole.set(row.role, current);
  }

  return [...byRole.values()].sort(
    (left, right) =>
      Math.abs(right.totalMinor) - Math.abs(left.totalMinor) || left.role.localeCompare(right.role),
  );
}

export function buildFinanceAnalysisView(
  report: Readonly<FinanceCashFlowReport>,
  currency: string,
  range: FinanceAnalysisRange,
): FinanceAnalysisView | null {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!normalizedCurrency) return null;

  const currencyMonths = report.monthly
    .filter((row) => row.currency === normalizedCurrency)
    .sort((left, right) => left.month.localeCompare(right.month));

  const latestMonth = currencyMonths.at(-1)?.month;
  if (!latestMonth) return null;

  const windowStartMonth = rangeStartMonth(latestMonth, range);
  const monthly = currencyMonths.filter(
    (row) => row.month >= windowStartMonth && row.month <= latestMonth,
  );
  if (monthly.length === 0) return null;

  const monthlyRoleTotals = report.monthlyRoleTotals.filter(
    (row) =>
      row.currency === normalizedCurrency &&
      row.month >= windowStartMonth &&
      row.month <= latestMonth,
  );
  const roleTotals = aggregateRoles(monthlyRoleTotals);

  const totals = monthly.reduce<FinanceCashFlowCurrencySummary>(
    (current, row) => ({
      currency: normalizedCurrency,
      incomeMinor: current.incomeMinor + row.incomeMinor,
      expenseMinor: current.expenseMinor + row.expenseMinor,
      adjustmentMinor: current.adjustmentMinor + row.adjustmentMinor,
      netMinor: current.netMinor + row.netMinor,
    }),
    {
      currency: normalizedCurrency,
      incomeMinor: 0,
      expenseMinor: 0,
      adjustmentMinor: 0,
      netMinor: 0,
    },
  );

  const expectedMonthCount = inclusiveMonthCount(windowStartMonth, latestMonth);

  return {
    currency: normalizedCurrency,
    range,
    windowStartMonth,
    windowEndMonth: latestMonth,
    observedStartMonth: monthly[0].month,
    observedEndMonth: monthly.at(-1)?.month ?? monthly[0].month,
    expectedMonthCount,
    observedMonthCount: monthly.length,
    hasMonthGaps: monthly.length !== expectedMonthCount,
    monthly,
    monthlyRoleTotals,
    roleTotals,
    totals,
  };
}
