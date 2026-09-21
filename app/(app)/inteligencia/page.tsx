import { Brain } from 'lucide-react';
import type { Metadata } from 'next';

import { IntelligenceDashboard } from '@/components/intelligence/IntelligenceDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { getIntelligenceHubData } from '@/lib/data/intelligence-source';

import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'Inteligencia' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function InteligenciaPage() {
  const editorial = await getIntelligenceHubData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Inteligencia"
        description="Acá entendés qué está cambiando, qué significa y por qué. Para decidir qué hacer ahora, está Profesional."
        icon={Brain}
        domain="productivity"
      />

      <IntelligenceDashboard editorial={editorial} />
    </div>
  );
}
