import 'server-only';

import { getFinanceMonthlyDashboardSnapshot } from '@/lib/finance/monthly-dashboard-store';
import { getFinancePlanningStoreSnapshot } from '@/lib/finance/planning-store';

import {
  buildPersonalShoppingFinanceContext,
  type PersonalShoppingFinanceContext,
} from './finance-context-core';

export async function getPersonalShoppingFinanceContext(): Promise<PersonalShoppingFinanceContext> {
  const [monthlyResult, planningResult] = await Promise.allSettled([
    getFinanceMonthlyDashboardSnapshot(),
    getFinancePlanningStoreSnapshot(),
  ]);

  const monthly =
    monthlyResult.status === 'fulfilled' && monthlyResult.value.ok
      ? monthlyResult.value.model
      : null;
  const planning =
    planningResult.status === 'fulfilled' && planningResult.value.ok
      ? planningResult.value.model
      : null;

  return buildPersonalShoppingFinanceContext({ monthly, planning });
}
