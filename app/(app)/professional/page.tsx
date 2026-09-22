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
        description="Qué conviene desarrollar, qué ya podés demostrar, cómo se mueve el mercado y qué hacer vos vs. qué delegar a la IA."
        icon={Brain}
        domain="projects"
      />

      <ProfessionalDashboard
        data={data.professional}
        editorial={data.editorial}
        technologyLibrary={data.technologyLibrary}
        careerResilience={data.careerResilience}
      />
    </div>
  );
}
