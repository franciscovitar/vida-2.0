import { Film } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { MediaDashboardView } from '@/components/media/MediaDashboard';
import { loadMediaDashboard } from '@/lib/media/load';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Media' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MediaPage() {
  const data = await loadMediaDashboard();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Media"
        description="Tu biblioteca personal para explorar películas y series sin convertir el Banco en una lista de pendientes."
        icon={Film}
        domain="learning"
      />
      <MediaDashboardView data={data} />
    </div>
  );
}
