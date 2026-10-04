import { Layers3 } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/PageHeader';
import { WorldSurfaceView } from '@/components/world/WorldSurface';
import { getWorldSurfaceData } from '@/lib/data/world-source';
import { worldDomainFromSlug, worldDomainLabel } from '@/lib/world/contract';

import pageStyles from '../../../page.module.scss';

export const metadata: Metadata = { title: 'Tema · World' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function WorldDomainPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain: slug } = await params;
  const domain = worldDomainFromSlug(slug);
  if (!domain) notFound();

  const data = await getWorldSurfaceData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={worldDomainLabel(domain)}
        description="El mismo estado publicado de World, filtrado por dominio sin volver a rankear la evidencia."
        icon={Layers3}
        domain="neutral"
      />
      <WorldSurfaceView data={data} view={{ kind: 'domain', domain }} />
    </div>
  );
}
