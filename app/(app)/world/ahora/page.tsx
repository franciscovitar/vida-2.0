import { Radio } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { WorldSurfaceView } from '@/components/world/WorldSurface';
import { getWorldSurfaceData } from '@/lib/data/world-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'World · Ahora' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const data = await getWorldSurfaceData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="World · Ahora"
        description="Qué cambió en el mundo y merece atención, sin feed infinito ni repetición."
        icon={Radio}
        domain="neutral"
      />
      <WorldSurfaceView data={data} view={{ kind: 'now' }} />
    </div>
  );
}
