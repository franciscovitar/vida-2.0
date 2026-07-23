import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { Breadcrumbs } from '@/components/web-catalog/Breadcrumbs';
import { CatalogState } from '@/components/web-catalog/CatalogState';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { isWebCatalogVisibleFailure } from '@/lib/web-catalog/errors';
import { WEB_CATALOG_SECTION_LABELS } from '@/lib/web-catalog/section-labels';
import { resolveWebCatalogPage } from '@/lib/web-catalog/service';

import pageStyles from '../../page.module.scss';
import styles from './page.module.scss';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Registro Web',
  robots: { index: false, follow: false },
};

export default async function WebCatalogSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAuthorizedSession();

  if (!isWebCatalogEnabled()) notFound();

  const { slug } = await params;
  const result = await resolveWebCatalogPage(slug);

  if (!result.ok) {
    if (!isWebCatalogVisibleFailure(result.code)) notFound();
    return (
      <div className={pageStyles.page}>
        <PageHeader
          title="Registro Web"
          description="Estado de la fuente documental"
          icon={FileText}
        />
        <CatalogState
          title="No se pudo cargar esta página"
          message={result.message}
          code={result.code}
        />
      </div>
    );
  }

  if (result.kind === 'redirect') {
    redirect(`/p/${result.slug}`);
  }

  if (result.kind === 'unimplemented-renderer') {
    return (
      <div className={pageStyles.page}>
        <PageHeader
          title={result.entry.editorialName}
          description={result.message}
          icon={FileText}
        />
        <Card>
          <p className={styles.note}>
            Renderer <span className="tabular">{result.entry.renderMode}</span> todavía no
            implementado.
          </p>
        </Card>
      </div>
    );
  }

  const sectionLabel = WEB_CATALOG_SECTION_LABELS[result.page.section];

  return (
    <div className={pageStyles.page}>
      <Breadcrumbs items={[{ label: sectionLabel }, { label: result.page.title }]} />
      <PageHeader title={result.page.title} description={sectionLabel} icon={FileText} />
      <ContentPageView page={result.page} />
    </div>
  );
}
