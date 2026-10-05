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

type TemporalResolution = 'day' | 'week' | 'month' | 'year';

function temporalResolution(value: string | undefined): TemporalResolution {
  return value === 'week' || value === 'month' || value === 'year' ? value : 'day';
}

export default async function WorldDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ domain: slug }, { period }] = await Promise.all([params, searchParams]);
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
      <WorldSurfaceView
        data={data}
        view={{ kind: 'domain', domain, period: temporalResolution(period) }}
      />
    </div>
  );
}
