import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { WorldSurfaceView } from '@/components/world/WorldSurface';
import { getWorldSurfaceData } from '@/lib/data/world-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'World · Aprender' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const data = await getWorldSurfaceData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="World · Aprender"
        description="Conocimiento durable explicado desde cero, con contexto, ejemplos y límites claros."
        icon={BookOpen}
        domain="neutral"
      />
      <WorldSurfaceView data={data} view={{ kind: 'learn' }} />
    </div>
  );
}
