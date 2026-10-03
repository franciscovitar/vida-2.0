import { Library } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { WorldSurfaceView } from '@/components/world/WorldSurface';
import { getWorldSurfaceData } from '@/lib/data/world-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'World · Biblioteca' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const data = await getWorldSurfaceData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="World · Biblioteca"
        description="Lo publicado queda disponible para volver cuando sirva; no es una cola de pendientes."
        icon={Library}
        domain="neutral"
      />
      <WorldSurfaceView data={data} view={{ kind: 'library' }} />
    </div>
  );
}
