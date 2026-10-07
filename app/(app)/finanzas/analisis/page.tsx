import { CircleGauge, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

export const metadata: Metadata = { title: 'Análisis · Finanzas' };

export default function FinanceAnalysisPage() {
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />
      <FinanceNavigation current="analysis" />
      <Card>
        <SectionHeader
          title="Análisis"
          description="Cash flow, composición y salud financiera se van a leer acá con períodos explícitos."
          icon={CircleGauge}
          domain="finance"
        />
        <p>El histórico actual se migra en un checkpoint posterior y seguirá usando los mismos datos.</p>
      </Card>
    </div>
  );
}
