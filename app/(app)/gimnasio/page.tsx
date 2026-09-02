import { Dumbbell } from 'lucide-react';
import type { Metadata } from 'next';

import { GymDashboardView } from '@/components/gym/GymDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadGymDashboard } from '@/lib/gym/load';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Gimnasio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function GimnasioPage() {
  const data = await loadGymDashboard();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Gimnasio"
        description="Progreso, comparaciones y contexto para entender cómo estás entrenando."
        icon={Dumbbell}
        domain="health"
      />
      <GymDashboardView data={data} />
    </div>
  );
}
