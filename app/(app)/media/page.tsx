import { Film } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { MediaFocusDashboard } from '@/components/media/MediaFocusDashboard';
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
        description="Elegí desde un Foco pequeño y ampliable. El Banco completo sigue disponible sin convertirse en una lista de pendientes."
        icon={Film}
        domain="learning"
      />
      <MediaFocusDashboard data={data} />
    </div>
  );
}
