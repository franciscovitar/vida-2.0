import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { WorldTemporalView } from '@/components/world/WorldTemporal';
import { getWorldTemporalPageData } from '@/lib/data/world-source';

import pageStyles from '../../../page.module.scss';

export const metadata: Metadata = { title: 'World · Ahora · Semana' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const period = typeof params.period === 'string' ? params.period : null;
  const data = await getWorldTemporalPageData('WEEK', period);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="World · Semana"
        description="Lo que realmente sobrevivió al ruido de la semana anterior."
        icon={CalendarDays}
        domain="neutral"
      />
      <WorldTemporalView data={data} />
    </div>
  );
}
