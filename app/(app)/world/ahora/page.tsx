import { Radio } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { WorldTemporalView } from '@/components/world/WorldTemporal';
import { getWorldTemporalPageData } from '@/lib/data/world-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'World · Ahora · Día' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const data = await getWorldTemporalPageData('DAY');

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="World · Ahora"
        description="Panorama del último día cerrado, con profundidad solo donde hace falta."
        icon={Radio}
        domain="neutral"
      />
      <WorldTemporalView data={data} />
    </div>
  );
}
