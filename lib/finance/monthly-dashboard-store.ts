import 'server-only';

import {
  buildFinanceMonthlyDashboard,
  type FinanceMonthlyDashboard,
} from '@/lib/finance/monthly-dashboard-core';
import { readFinanceSheet, type FinanceStoreFailureCode } from '@/lib/finance/store/client';

export type FinanceMonthlyDashboardSnapshot =
  { ok: true; model: FinanceMonthlyDashboard } | { ok: false; code: FinanceStoreFailureCode };

function currentFinanceDateParts(): { month: string; asOf: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') ?? '';
  const monthNumber = byType.get('month') ?? '';
  const day = byType.get('day') ?? '';
  return {
    month: `${year}-${monthNumber}`,
    asOf: `${year}-${monthNumber}-${day}`,
  };
}

export async function getFinanceMonthlyDashboardSnapshot(): Promise<FinanceMonthlyDashboardSnapshot> {
  const [manualIntake, monthlyTargets, liquiditySnapshots] = await Promise.all([
    readFinanceSheet('manualIntake'),
    readFinanceSheet('monthlyTargets'),
    readFinanceSheet('liquiditySnapshots'),
  ]);

  if (!manualIntake.ok) return { ok: false, code: manualIntake.code };
  if (!monthlyTargets.ok) return { ok: false, code: monthlyTargets.code };
  if (!liquiditySnapshots.ok) return { ok: false, code: liquiditySnapshots.code };

  const current = currentFinanceDateParts();
  return {
    ok: true,
    model: buildFinanceMonthlyDashboard({
      manualIntake: manualIntake.values,
      monthlyTargets: monthlyTargets.values,
      liquiditySnapshots: liquiditySnapshots.values,
      month: current.month,
      currency: 'ARS',
      asOf: current.asOf,
    }),
  };
}
