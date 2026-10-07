import { Database, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

export const metadata: Metadata = { title: 'Datos y fuentes · Finanzas' };

export default function FinanceDataPage() {
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />
      <FinanceNavigation current="data" />
      <Card>
        <SectionHeader
          title="Datos y fuentes"
          description="Calidad, cobertura, conciliación y metodología quedan agrupadas acá."
          icon={Database}
          domain="finance"
        />
        <p>Esta vista se completa cuando migremos la información técnica que salió del Resumen.</p>
      </Card>
    </div>
  );
}
