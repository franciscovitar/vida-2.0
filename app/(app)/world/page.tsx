import { Globe2 } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { WorldSurfaceView } from '@/components/world/WorldSurface';
import { getWorldSurfaceData } from '@/lib/data/world-source';

import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'World' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const data = await getWorldSurfaceData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="World"
        description="Una edición calma para entender qué cambió y aprender algo que valga la pena."
        icon={Globe2}
        domain="neutral"
      />
      <WorldSurfaceView data={data} view={{ kind: 'home' }} />
    </div>
  );
}
