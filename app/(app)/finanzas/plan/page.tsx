import { CircleGauge, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

export const metadata: Metadata = { title: 'Plan · Finanzas' };

export default function FinancePlanPage() {
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />
      <FinanceNavigation current="plan" />
      <Card>
        <SectionHeader
          title="Plan"
          description="Safe-to-Spend, ingresos variables y escenarios de compra van a quedar juntos en esta vista."
          icon={CircleGauge}
          domain="finance"
        />
        <p>La funcionalidad existente se migra acá en el checkpoint de Plan, sin cambiar sus cálculos.</p>
      </Card>
    </div>
  );
}
