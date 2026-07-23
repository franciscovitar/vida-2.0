import { FileText, type LucideIcon } from 'lucide-react';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/web-catalog/Breadcrumbs';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';
import { WEB_CATALOG_SECTION_LABELS } from '@/lib/web-catalog/section-labels';
import { isWebCatalogEnabled } from '@/lib/web-catalog/config';
import {
  resolveWebCatalogPageByStableKey,
  type WebCatalogPageServiceResult,
} from '@/lib/web-catalog/service';
import type { Domain } from '@/types';
import type { DocumentPresentation } from '@/lib/web-catalog/document-overview';

import pageStyles from '@/app/(app)/page.module.scss';

type PlaceholderProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  domain: Domain;
  emptyTitle: string;
  emptyDescription: string;
  preview: string[];
};

function renderCatalogResult(
  result: WebCatalogPageServiceResult,
  fallbackTitle: string,
  presentation?: DocumentPresentation,
) {
  if (!result.ok) {
    if (result.code === 'not-configured') {
      return (
        <div className={pageStyles.page}>
          <PageHeader title={fallbackTitle} description={result.message} icon={FileText} />
        </div>
      );
    }
    notFound();
  }

  if (result.kind === 'redirect') {
    notFound();
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
          <p>Renderer especializado todavía no disponible.</p>
        </Card>
      </div>
    );
  }

  const sectionLabel = WEB_CATALOG_SECTION_LABELS[result.page.section];

  return (
    <div className={pageStyles.page}>
      <Breadcrumbs items={[{ label: sectionLabel }, { label: result.page.title }]} />
      <PageHeader title={result.page.title} description={sectionLabel} icon={FileText} />
      <ContentPageView page={result.page} presentation={presentation} />
    </div>
  );
}

/**
 * Ruta fija documental: con flag apagada conserva placeholder;
 * con flag activa resuelve por clave estable.
 */
export async function DocumentaryStableKeyPage({
  stableKey,
  placeholder,
  presentation,
}: {
  stableKey: string;
  placeholder: PlaceholderProps;
  presentation?: DocumentPresentation;
}) {
  if (!isWebCatalogEnabled()) {
    return <PlaceholderPage {...placeholder} />;
  }

  const result = await resolveWebCatalogPageByStableKey(stableKey);
  return renderCatalogResult(result, placeholder.title, presentation);
}
