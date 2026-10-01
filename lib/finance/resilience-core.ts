import type { FinancePlanningSnapshot } from '@/lib/finance/planning-core';
import type { FinanceCashFlowReport } from '@/lib/finance/reporting/cash-flow-core';

export const FINANCE_RESILIENCE_VERSION = 'finance-resilience-v1.0.0';

export interface FinanceResilienceIndicators {
  version: typeof FINANCE_RESILIENCE_VERSION;
  currency: string;
  observedMonths: number;
  earnedIncomeShare: number | null;
  monthlyIncomeVolatility: number | null;
  reserveCoverageMonths: number | null;
  liquidityCoverageMonths: number | null;
  dataQuality: 'ready' | 'limited';
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function populationStandardDeviation(values: readonly number[], average: number): number {
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function buildFinanceResilienceIndicators(
  report: Readonly<FinanceCashFlowReport>,
  currency: string,
  planning: Readonly<FinancePlanningSnapshot> | null,
): FinanceResilienceIndicators {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!normalizedCurrency) throw new RangeError('currency must not be empty');

  const monthlyIncome = report.monthly
    .filter((row) => row.currency === normalizedCurrency)
    .map((row) => row.incomeMinor);

  const totalIncome = report.roleTotals
    .filter((row) => row.currency === normalizedCurrency && row.role.startsWith('income_'))
    .reduce((total, row) => total + row.totalMinor, 0);

  const earnedIncome = report.roleTotals
    .filter((row) => row.currency === normalizedCurrency && row.role === 'income_work')
    .reduce((total, row) => total + row.totalMinor, 0);

  const earnedIncomeShare = totalIncome > 0 ? earnedIncome / totalIncome : null;

  const averageIncome = mean(monthlyIncome);
  const monthlyIncomeVolatility =
    monthlyIncome.length >= 3 && averageIncome !== null && averageIncome > 0
      ? populationStandardDeviation(monthlyIncome, averageIncome) / averageIncome
      : null;

  return {
    version: FINANCE_RESILIENCE_VERSION,
    currency: normalizedCurrency,
    observedMonths: monthlyIncome.length,
    earnedIncomeShare,
    monthlyIncomeVolatility,
    reserveCoverageMonths: planning?.resilience.reserveCoverageMonths ?? null,
    liquidityCoverageMonths: planning?.resilience.essentialCoverageMonths ?? null,
    dataQuality: report.quality === 'ready' ? 'ready' : 'limited',
  };
}
