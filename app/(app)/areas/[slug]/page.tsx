import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AreaDashboardView } from '@/components/areas/AreaDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { getCanonicalAreaDef, isAreaSlug } from '@/lib/areas/canonical';
import { loadAreaDashboard } from '@/lib/areas/load';

import styles from '../../page.module.scss';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const def = getCanonicalAreaDef(slug);
  return {
    title: def?.matchNames[0] ?? 'Área',
    robots: { index: false, follow: false },
  };
}

export default async function AreaSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAreaSlug(slug)) notFound();

  const result = await loadAreaDashboard(slug);
  if (!result.ok) {
    if (result.code === 'notion-unavailable') {
      return (
        <div className={styles.page}>
          <PageHeader title="Área" description={result.message} icon={Boxes} domain="projects" />
          <Card>
            <p>El panel no puede armarse sin Notion operativo.</p>
          </Card>
        </div>
      );
    }
    notFound();
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={result.data.summary.name}
        description={`Estado: ${result.data.summary.status} · Revisión: ${result.data.summary.reviewDate ?? '—'}`}
        icon={Boxes}
        domain={result.data.summary.domain}
      />
      <AreaDashboardView data={result.data} />
    </div>
  );
}
