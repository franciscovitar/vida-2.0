import { ClipboardList } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { GymRoutineDashboardView } from '@/components/gym/GymDashboard';
import { GymNavigation } from '@/components/gym/GymNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadGymPageData } from '@/lib/gym/page-data';

export const metadata: Metadata = { title: 'Rutina · Gimnasio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function GymRoutinePage() {
  const data = await loadGymPageData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Rutina"
        description="Qué hacer y cómo está prescripto el plan actual."
        icon={ClipboardList}
        domain="health"
      />
      <GymNavigation current="routine" />
      <GymRoutineDashboardView data={data} />
    </div>
  );
}
