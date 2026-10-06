import { Brain } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { ProfessionalPanorama } from '@/components/professional/ProfessionalPanorama';
import { ProfessionalNavigation } from '@/components/professional/ProfessionalNavigation';
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
        description="Qué cambió en el trabajo, la IA y la tecnología; qué significa para vos y qué conviene hacer."
        icon={Brain}
        domain="projects"
      />

      <ProfessionalNavigation current="panorama" />

      <ProfessionalPanorama data={data.professional} />
    </div>
  );
}
