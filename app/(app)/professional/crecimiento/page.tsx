import { Target } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { ProfessionalGrowth } from '@/components/professional/ProfessionalGrowth';
import { ProfessionalNavigation } from '@/components/professional/ProfessionalNavigation';
import { getProfessionalGrowthPageData } from '@/lib/data/professional-intelligence-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Crecimiento · Profesional' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ProfessionalGrowthPage() {
  const professional = await getProfessionalGrowthPageData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Perfil & Crecimiento"
        description="Qué ya demostraste, qué conviene fortalecer y qué trabajo sigue siendo tuyo aunque uses IA."
        icon={Target}
        domain="projects"
      />
      <ProfessionalNavigation current="crecimiento" />
      <ProfessionalGrowth data={professional} />
    </div>
  );
}
