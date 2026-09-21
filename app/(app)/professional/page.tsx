import { Brain } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { ProfessionalDashboard } from '@/components/professional/ProfessionalDashboard';
import { getProfessionalIntelligencePageData } from '@/lib/data/professional-intelligence-source';

import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'Profesional' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ProfessionalPage() {
  const data = await getProfessionalIntelligencePageData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Profesional"
        description="Evidencia, prioridades, mercado, IA y tecnología para decidir qué desarrollar o demostrar."
        icon={Brain}
        domain="projects"
      />

      <ProfessionalDashboard data={data.professional} editorial={data.editorial} />
    </div>
  );
}
