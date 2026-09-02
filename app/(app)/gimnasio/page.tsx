import { Dumbbell } from 'lucide-react';
import type { Metadata } from 'next';

import { GymDashboardView } from '@/components/gym/GymDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadGymDashboard } from '@/lib/gym/load';
import { loadGymSessionsSnapshot } from '@/lib/gym/sheets-sessions-port';
import type { GymDashboardData } from '@/types/gym';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Gimnasio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function withCanonicalGymHistory(data: GymDashboardData): Promise<GymDashboardData> {
  const sessionSource = data.sources.find((source) => source.kind === 'sessions');
  if (sessionSource?.state !== 'not-applicable') return data;

  const snapshot = await loadGymSessionsSnapshot();
  const sources = data.sources.map((source) =>
    source.kind === 'sessions'
      ? { kind: 'sessions' as const, state: snapshot.state, notice: snapshot.notice }
      : source,
  );

  return {
    ...data,
    moduleStatus:
      data.moduleStatus === 'flag-disabled' && snapshot.state === 'ready'
        ? 'partial'
        : data.moduleStatus,
    moduleNotice:
      data.moduleStatus === 'flag-disabled' && snapshot.state === 'ready'
        ? 'El historial de gimnasio está disponible; la rutina documental sigue desactivada.'
        : data.moduleNotice,
    sessions: snapshot.sessions,
    sessionSummaries: snapshot.summaries,
    exerciseProgress: snapshot.exerciseProgress,
    sessionsPendingNotice:
      snapshot.state === 'ready'
        ? 'Historial leído desde el registro canónico de gimnasio.'
        : (snapshot.notice ?? data.sessionsPendingNotice),
    sources,
  };
}

export default async function GimnasioPage() {
  const base = await loadGymDashboard();
  const data = await withCanonicalGymHistory(base);

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
