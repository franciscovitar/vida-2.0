import { Bike } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { GymCardioDashboardView } from '@/components/gym/GymDashboard';
import { GymNavigation } from '@/components/gym/GymNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadGymPageData } from '@/lib/gym/page-data';

export const metadata: Metadata = { title: 'Cardio · Gimnasio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function GymCardioPage() {
  const data = await loadGymPageData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Cardio"
        description="Pasos, bicicleta y fútbol contra tu plan; equivalencias como contexto secundario."
        icon={Bike}
        domain="health"
      />
      <GymNavigation current="cardio" />
      <GymCardioDashboardView data={data} />
    </div>
  );
}
