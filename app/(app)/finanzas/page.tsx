import { WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import { FinanceNavigation, type FinanceDataState } from '@/components/finance/FinanceNavigation';
import { MonthlyFinanceDashboard } from '@/components/finance/MonthlyFinanceDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { getFinanceMonthlyDashboardSnapshot } from '@/lib/finance/monthly-dashboard-store';
import { getFinanceCashFlowSnapshot } from '@/lib/finance/reporting/cash-flow';
import { getFinanceStoreReadinessSnapshot } from '@/lib/finance/store/readiness';

import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'Finanzas' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface FinanceDataReport {
  reviewRequiredTransactions: number;
  unbalancedTransactions: number;
  reconciliation: {
    conflict: number;
    partial: number;
  };
}

function resolveDataState(input: {
  connected: boolean;
  report: FinanceDataReport | null;
}): FinanceDataState {
  if (!input.connected) return 'unavailable';
  if (!input.report) return 'partial';

  if (
    input.report.reviewRequiredTransactions > 0 ||
    input.report.unbalancedTransactions > 0 ||
    input.report.reconciliation.conflict > 0
  ) {
    return 'review';
  }

  if (input.report.reconciliation.partial > 0) return 'partial';
  return 'ready';
}

async function readFinanceSummary() {
  return Promise.all([getFinanceMonthlyDashboardSnapshot(), getFinanceCashFlowSnapshot()]);
}

export default async function FinanzasPage() {
  const store = await getFinanceStoreReadinessSnapshot();
  const connected = store.status === 'connected';
  const reads = connected ? await readFinanceSummary() : null;
  const monthlyDashboard = reads?.[0] ?? null;
  const cashFlow = reads?.[1] ?? null;
  const monthlyDashboardModel = monthlyDashboard?.ok ? monthlyDashboard.model : null;
  const report = cashFlow?.ok ? cashFlow.report : null;
  const dataState = resolveDataState({ connected, report });

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />

      <FinanceNavigation current="summary" dataState={dataState} />

      {monthlyDashboardModel ? (
        <MonthlyFinanceDashboard model={monthlyDashboardModel} />
      ) : (
        <Card>
          <h2>Tu resumen no está disponible ahora</h2>
          <p>
            No mostramos números parciales ni simulados cuando la fuente financiera no puede
            leerse. Podés revisar el estado de los datos desde “Datos y fuentes”.
          </p>
        </Card>
      )}
    </div>
  );
}
