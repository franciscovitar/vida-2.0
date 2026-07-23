import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AreaDashboardView } from '@/components/areas/AreaDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import { Card } from '@/components/ui/Card';
import { getCanonicalAreaDef, isAreaSlug } from '@/lib/areas/canonical';
import { loadAreaDashboard } from '@/lib/areas/load';
import { isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';
import { resolveWebCatalogPageByStableKey } from '@/lib/web-catalog/service';

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

  const [result, facultyContent] = await Promise.all([
    loadAreaDashboard(slug),
    slug === 'facultad' && isWebCatalogEnabled()
      ? resolveWebCatalogPageByStableKey(WEB_CATALOG_FIXED_ROUTES.facultad.stableKey)
      : Promise.resolve(null),
  ]);
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
      {facultyContent?.ok && facultyContent.kind === 'document' ? (
        <ContentPageView page={facultyContent.page} presentation="faculty" />
      ) : null}
    </div>
  );
}
