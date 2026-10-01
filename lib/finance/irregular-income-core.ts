import type {
  FinanceCashFlowReport,
  FinanceMonthlyRoleTotal,
} from '@/lib/finance/reporting/cash-flow-core';
import type { FinanceEconomicRole } from '@/types/finance';

export const FINANCE_IRREGULAR_INCOME_VERSION = 'finance-irregular-income-v1.0.0';

export interface FinanceDistributionSummary {
  meanMinor: number;
  medianMinor: number;
  p25Minor: number;
  minMinor: number;
  maxMinor: number;
  coefficientOfVariation: number | null;
}

export interface FinanceIrregularIncomeMonth {
  month: string;
  familySupportMinor: number;
  workIncomeMinor: number;
  financialIncomeMinor: number;
  personalSpendMinor: number;
  professionalSpendMinor: number;
  totalSpendMinor: number;
  bridgeWithoutWorkMinor: number;
  netMinor: number;
}

export interface FinanceIrregularIncomeProfile {
  version: typeof FINANCE_IRREGULAR_INCOME_VERSION;
  currency: string;
  commonCoverageStart: string | null;
  commonCoverageEnd: string | null;
  completeMonthCount: number;
  months: FinanceIrregularIncomeMonth[];
  familySupport: FinanceDistributionSummary | null;
  workIncome: FinanceDistributionSummary | null;
  personalSpend: FinanceDistributionSummary | null;
  totalSpend: FinanceDistributionSummary | null;
  bridgeWithoutWork: FinanceDistributionSummary | null;
  negativeCashFlowMonths: number;
  negativeCashFlowShare: number | null;
  dataQuality: 'ready' | 'limited';
}

export interface FinanceSurvivalScenario {
  currency: string;
  leanMonthlyBurnMinor: number;
  expectedFamilySupportMinor: number;
  eligibleLiquidityMinor: number;
  monthlyBridgeMinor: number;
  noNewIncomeRunwayMonths: number;
  supportAdjustedRunwayMonths: number | null;
  supportCoversLeanBurn: boolean;
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new RangeError('currency must not be empty');
  return normalized;
}

function safeNonNegativeMinor(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function distribution(values: readonly number[]): FinanceDistributionSummary | null {
  if (values.length === 0) return null;
  const meanMinor = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - meanMinor) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);

  return {
    meanMinor,
    medianMinor: median(values),
    p25Minor: percentile(values, 0.25),
    minMinor: Math.min(...values),
    maxMinor: Math.max(...values),
    coefficientOfVariation: meanMinor > 0 ? standardDeviation / meanMinor : null,
  };
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return '';
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return end.toISOString().slice(0, 10);
}

function monthsInside(start: string, end: string): string[] {
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth || startDate > endDate) return [];

  const months: string[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const monthStart = `${key}-01`;
    if (monthStart >= startDate && monthEnd(key) <= endDate) months.push(key);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function roleAmount(
  rows: readonly FinanceMonthlyRoleTotal[],
  month: string,
  currency: string,
  role: FinanceEconomicRole,
): number {
  return rows
    .filter((row) => row.month === month && row.currency === currency && row.role === role)
    .reduce((total, row) => total + row.totalMinor, 0);
}

export function buildFinanceIrregularIncomeProfile(
  report: Readonly<FinanceCashFlowReport>,
  currency: string,
): FinanceIrregularIncomeProfile {
  const normalizedCurrency = normalizeCurrency(currency);
  const coverage = report.coverage.filter(
    (item) =>
      item.currency === normalizedCurrency &&
      item.periodStart.trim() !== '' &&
      item.periodEnd.trim() !== '',
  );

  const commonCoverageStart =
    coverage.length > 0
      ? (coverage
          .map((item) => item.periodStart.slice(0, 10))
          .sort()
          .at(-1) ?? null)
      : null;
  const commonCoverageEnd =
    coverage.length > 0
      ? (coverage
          .map((item) => item.periodEnd.slice(0, 10))
          .sort()
          .at(0) ?? null)
      : null;

  const completeMonths =
    commonCoverageStart && commonCoverageEnd
      ? monthsInside(commonCoverageStart, commonCoverageEnd)
      : [];

  const months = completeMonths.map((month) => {
    const familySupportMinor = Math.max(
      0,
      roleAmount(report.monthlyRoleTotals, month, normalizedCurrency, 'income_family_support'),
    );
    const workIncomeMinor = Math.max(
      0,
      roleAmount(report.monthlyRoleTotals, month, normalizedCurrency, 'income_work'),
    );
    const financialIncomeMinor = Math.max(
      0,
      roleAmount(report.monthlyRoleTotals, month, normalizedCurrency, 'income_financial'),
    );
    const personalSpendMinor = Math.max(
      0,
      -roleAmount(report.monthlyRoleTotals, month, normalizedCurrency, 'expense_personal'),
    );
    const professionalSpendMinor = Math.max(
      0,
      -roleAmount(report.monthlyRoleTotals, month, normalizedCurrency, 'expense_professional'),
    );
    const totalSpendMinor = personalSpendMinor + professionalSpendMinor;
    const cashFlow = report.monthly.find(
      (item) => item.month === month && item.currency === normalizedCurrency,
    );

    return {
      month,
      familySupportMinor,
      workIncomeMinor,
      financialIncomeMinor,
      personalSpendMinor,
      professionalSpendMinor,
      totalSpendMinor,
      bridgeWithoutWorkMinor: Math.max(0, totalSpendMinor - familySupportMinor),
      netMinor: cashFlow?.netMinor ?? 0,
    };
  });

  const negativeCashFlowMonths = months.filter((month) => month.netMinor < 0).length;

  return {
    version: FINANCE_IRREGULAR_INCOME_VERSION,
    currency: normalizedCurrency,
    commonCoverageStart,
    commonCoverageEnd,
    completeMonthCount: months.length,
    months,
    familySupport: distribution(months.map((month) => month.familySupportMinor)),
    workIncome: distribution(months.map((month) => month.workIncomeMinor)),
    personalSpend: distribution(months.map((month) => month.personalSpendMinor)),
    totalSpend: distribution(months.map((month) => month.totalSpendMinor)),
    bridgeWithoutWork: distribution(months.map((month) => month.bridgeWithoutWorkMinor)),
    negativeCashFlowMonths,
    negativeCashFlowShare: months.length > 0 ? negativeCashFlowMonths / months.length : null,
    dataQuality: report.quality === 'ready' && months.length >= 3 ? 'ready' : 'limited',
  };
}

export function evaluateFinanceSurvivalScenario(input: {
  currency: string;
  leanMonthlyBurnMinor: number;
  expectedFamilySupportMinor: number;
  eligibleLiquidityMinor: number;
}): FinanceSurvivalScenario {
  const currency = normalizeCurrency(input.currency);
  const leanMonthlyBurnMinor = safeNonNegativeMinor(
    'leanMonthlyBurnMinor',
    input.leanMonthlyBurnMinor,
  );
  const expectedFamilySupportMinor = safeNonNegativeMinor(
    'expectedFamilySupportMinor',
    input.expectedFamilySupportMinor,
  );
  const eligibleLiquidityMinor = safeNonNegativeMinor(
    'eligibleLiquidityMinor',
    input.eligibleLiquidityMinor,
  );

  if (leanMonthlyBurnMinor === 0) {
    throw new RangeError('leanMonthlyBurnMinor must be greater than zero');
  }

  const monthlyBridgeMinor = Math.max(0, leanMonthlyBurnMinor - expectedFamilySupportMinor);

  return {
    currency,
    leanMonthlyBurnMinor,
    expectedFamilySupportMinor,
    eligibleLiquidityMinor,
    monthlyBridgeMinor,
    noNewIncomeRunwayMonths: eligibleLiquidityMinor / leanMonthlyBurnMinor,
    supportAdjustedRunwayMonths:
      monthlyBridgeMinor > 0 ? eligibleLiquidityMinor / monthlyBridgeMinor : null,
    supportCoversLeanBurn: monthlyBridgeMinor === 0,
  };
}
