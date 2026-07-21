import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { isWebCatalogEnabled } from '@/lib/web-catalog/config';
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

  // Flag apagada: la ruta no publica contenido.
  if (!isWebCatalogEnabled()) notFound();

  const { slug } = await params;
  const result = await resolveWebCatalogPage(slug);

  if (!result.ok) {
    if (result.code === 'not-configured') {
      return (
        <div className={pageStyles.page}>
          <PageHeader title="Registro Web" description={result.message} icon={FileText} />
        </div>
      );
    }
    notFound();
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

  return (
    <div className={pageStyles.page}>
      <PageHeader title={result.page.title} description="Registro Web" icon={FileText} />
      <ContentPageView page={result.page} />
    </div>
  );
}
