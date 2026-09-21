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
  const data = await getIntelligenceHubData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Inteligencia"
        description="Qué cambió, qué significa para vos y qué merece tu atención — sin convertir informarte en otra tarea."
        icon={Brain}
        domain="productivity"
      />

      <IntelligenceDashboard editorial={data.editorial} professional={data.professional} />
    </div>
  );
}
