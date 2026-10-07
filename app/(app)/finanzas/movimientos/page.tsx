import { ListChecks, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

export const metadata: Metadata = { title: 'Movimientos · Finanzas' };

export default function FinanceMovementsPage() {
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />
      <FinanceNavigation current="movements" />
      <Card>
        <SectionHeader
          title="Movimientos"
          description="Acá va a vivir la vista para buscar, filtrar e inspeccionar lo que pasó con tu plata."
          icon={ListChecks}
          domain="finance"
        />
        <p>
          La lista completa se incorpora en el siguiente checkpoint sin cambiar la fuente de verdad.
        </p>
      </Card>
    </div>
  );
}
