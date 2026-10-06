import { LineChart } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { GymProgressDashboardView } from '@/components/gym/GymDashboard';
import { GymNavigation } from '@/components/gym/GymNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadGymPageData } from '@/lib/gym/page-data';

export const metadata: Metadata = { title: 'Progreso · Gimnasio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function GymProgressPage() {
  const data = await loadGymPageData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Progreso"
        description="Tendencias personales, historial y referencias externas con jerarquía clara."
        icon={LineChart}
        domain="health"
      />
      <GymNavigation current="progress" />
      <GymProgressDashboardView data={data} />
    </div>
  );
}
