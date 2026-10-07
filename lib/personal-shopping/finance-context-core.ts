import type { FinanceMonthlyDashboard } from '@/lib/finance/monthly-dashboard-core';
import {
  evaluateFinancePurchaseScenario,
  type FinancePurchaseScenario,
  type FinancePurchaseScenarioSource,
} from '@/lib/finance/planning-core';
import type {
  FinanceLiquidityQuality,
  FinancePlanningReadModel,
} from '@/lib/finance/planning-store-core';

import type { PersonalPurchaseItem } from './types';

export interface PersonalShoppingMonthlyTargetSource {
  month: string;
  currency: string;
  activeTargetMinor: number;
  expenseMinor: number;
  remainingTargetMinor: number;
}

export interface PersonalShoppingSafeToSpendSource extends FinancePurchaseScenarioSource {
  liquidityQuality: FinanceLiquidityQuality;
}

export interface PersonalShoppingFinanceContext {
  monthlyTargets: PersonalShoppingMonthlyTargetSource[];
  safeToSpend: PersonalShoppingSafeToSpendSource[];
}

export interface PersonalShoppingMonthlyTargetImpact extends PersonalShoppingMonthlyTargetSource {
  purchaseAmountMinor: number;
  projectedExpenseMinor: number;
  postRemainingTargetMinor: number;
  projectedOverTargetMinor: number;
}

export interface PersonalShoppingSafeToSpendImpact {
  liquidityQuality: FinanceLiquidityQuality;
  scenario: FinancePurchaseScenario;
}

export interface PersonalShoppingFinanceImpact {
  itemId: string;
  currency: string;
  purchaseAmountMinor: number;
  monthlyTarget: PersonalShoppingMonthlyTargetImpact | null;
  safeToSpend: PersonalShoppingSafeToSpendImpact | null;
}

export const EMPTY_PERSONAL_SHOPPING_FINANCE_CONTEXT: PersonalShoppingFinanceContext = {
  monthlyTargets: [],
  safeToSpend: [],
};

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function buildPersonalShoppingFinanceContext(input: {
  monthly: FinanceMonthlyDashboard | null;
  planning: FinancePlanningReadModel | null;
}): PersonalShoppingFinanceContext {
  const monthlyTargets: PersonalShoppingMonthlyTargetSource[] = [];
  const target = input.monthly?.target ?? null;

  if (
    input.monthly &&
    target &&
    normalizeCurrency(target.currency) === normalizeCurrency(input.monthly.currency)
  ) {
    monthlyTargets.push({
      month: input.monthly.month,
      currency: normalizeCurrency(input.monthly.currency),
      activeTargetMinor: target.activeTargetMinor,
      expenseMinor: input.monthly.expenseMinor,
      remainingTargetMinor:
        input.monthly.remainingTargetMinor ??
        Math.max(0, target.activeTargetMinor - input.monthly.expenseMinor),
    });
  }

  const safeToSpend: PersonalShoppingSafeToSpendSource[] = [];
  for (const item of input.planning?.currencies ?? []) {
    if (item.status !== 'ready' || !item.snapshot || !item.liquidityQuality) continue;

    safeToSpend.push({
      currency: normalizeCurrency(item.currency),
      liquidityQuality: item.liquidityQuality,
      safeToSpend: item.snapshot.safeToSpend,
    });
  }

  return { monthlyTargets, safeToSpend };
}

export function evaluatePersonalShoppingFinanceImpact(
  item: Readonly<PersonalPurchaseItem>,
  context: Readonly<PersonalShoppingFinanceContext>,
): PersonalShoppingFinanceImpact | null {
  if (item.state === 'PURCHASED' || item.state === 'DISCARDED') return null;
  if (!item.currency || item.estimatedPriceMinor === null || item.estimatedPriceMinor <= 0) {
    return null;
  }

  const currency = normalizeCurrency(item.currency);
  const purchaseAmountMinor = item.estimatedPriceMinor;
  const monthlySource =
    context.monthlyTargets.find((source) => source.currency === currency) ?? null;
  const safeSource = context.safeToSpend.find((source) => source.currency === currency) ?? null;

  const monthlyTarget = monthlySource
    ? {
        ...monthlySource,
        purchaseAmountMinor,
        projectedExpenseMinor: monthlySource.expenseMinor + purchaseAmountMinor,
        postRemainingTargetMinor: Math.max(
          0,
          monthlySource.activeTargetMinor - monthlySource.expenseMinor - purchaseAmountMinor,
        ),
        projectedOverTargetMinor: Math.max(
          0,
          monthlySource.expenseMinor + purchaseAmountMinor - monthlySource.activeTargetMinor,
        ),
      }
    : null;

  let safeToSpend: PersonalShoppingSafeToSpendImpact | null = null;
  if (safeSource) {
    try {
      safeToSpend = {
        liquidityQuality: safeSource.liquidityQuality,
        scenario: evaluateFinancePurchaseScenario(safeSource, purchaseAmountMinor),
      };
    } catch {
      safeToSpend = null;
    }
  }

  return {
    itemId: item.id,
    currency,
    purchaseAmountMinor,
    monthlyTarget,
    safeToSpend,
  };
}
