import { Dumbbell } from 'lucide-react';
import type { Metadata } from 'next';

import { GymSessionPanel } from '@/components/actions/GymSessionPanel';
import { GymDashboardView } from '@/components/gym/GymDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { loadGymDashboard } from '@/lib/gym/load';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Gimnasio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function GimnasioPage() {
  const data = await loadGymDashboard();
  const writesEnabled = isWriteActionsEnabled();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Gimnasio"
        description="Rutina, contexto de salud e historial en un panel de solo lectura."
        icon={Dumbbell}
        domain="health"
      />
      <GymDashboardView data={data} />
      <GymSessionPanel writesEnabled={writesEnabled} routine={data.routine} />
    </div>
  );
}
