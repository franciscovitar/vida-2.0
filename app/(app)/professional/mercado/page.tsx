import { LineChart } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { ProfessionalMarket } from '@/components/professional/ProfessionalMarket';
import { ProfessionalNavigation } from '@/components/professional/ProfessionalNavigation';
import { getProfessionalMarketPageData } from '@/lib/data/professional-intelligence-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Mercado · Profesional' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ProfessionalMarketPage() {
  const data = await getProfessionalMarketPageData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Mercado"
        description="Demanda, crecimiento, compensación y transformación por IA, siempre con geografía y período visibles."
        icon={LineChart}
        domain="projects"
      />
      <ProfessionalNavigation current="mercado" />
      <ProfessionalMarket
        professional={data.professional}
        careerResilience={data.careerResilience}
      />
    </div>
  );
}
