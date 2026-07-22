import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';

import { AreasIndexView } from '@/components/areas/AreaDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { loadAreasIndex } from '@/lib/areas/load';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Áreas' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AreasPage() {
  const result = await loadAreasIndex();

  if (!result.ok) {
    return (
      <div className={styles.page}>
        <PageHeader title="Áreas" description={result.message} icon={Boxes} domain="projects" />
        <Card>
          <p>No se pudo cargar el listado de Áreas.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Áreas"
        description="Paneles read-only de las cuatro Áreas canónicas."
        icon={Boxes}
        domain="projects"
      />
      {result.summaries.length === 0 ? (
        <Card>
          <p>No hay Áreas canónicas disponibles en Notion.</p>
        </Card>
      ) : (
        <AreasIndexView summaries={result.summaries} sources={result.sources} />
      )}
    </div>
  );
}
