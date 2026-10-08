import { BookOpen, Brain, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';

import { LearningHubV2 } from '@/components/learning/LearningHubV2';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { DocumentaryStableKeyPage } from '@/components/web-catalog/DocumentaryStableKeyPage';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getAssessmentProgress } from '@/lib/data/assessment-progress-source';
import { isLearningHubV2UiEnabled } from '@/lib/learning/v2-config';
import { getUniversityStudyCatalog } from '@/lib/study-engine/catalog-source';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';

import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'Aprendizaje' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AprendizajePage() {
  await requireAuthorizedSession();

  const v2Enabled = isLearningHubV2UiEnabled();

  if (!v2Enabled) {
    return (
      <DocumentaryStableKeyPage
        presentation="learning"
        stableKey={WEB_CATALOG_FIXED_ROUTES.aprendizaje.stableKey}
        action={
          <>
            <Button href="/aprendizaje/estudio" variant="primary" size="sm" iconLeft={Brain}>
              Estudiar
            </Button>
            <Button
              href="/aprendizaje/ingles"
              variant="secondary"
              size="sm"
              iconLeft={MessageCircle}
            >
              English Speaking
            </Button>
          </>
        }
        placeholder={{
          title: 'Aprendizaje',
          description: 'Cursos, lecturas y conocimiento en progreso.',
          icon: BookOpen,
          domain: 'learning',
          emptyTitle: 'Todavía no hay aprendizaje registrado',
          emptyDescription:
            'Con el Registro Web activo verás acá el documento canónico de aprendizaje.',
          preview: ['En progreso', 'Lecturas pendientes', 'Notas recientes', 'Tiempo dedicado'],
        }}
      />
    );
  }

  const [catalog, assessmentProgress] = await Promise.all([
    getUniversityStudyCatalog(),
    getAssessmentProgress(),
  ]);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Aprendizaje"
        description="Facultad, práctica adaptativa, English Speaking y exploración generalista sin convertir aprendizaje en deuda."
        icon={BookOpen}
        domain="learning"
        action={
          <>
            <Button href="/aprendizaje/estudio" variant="primary" size="sm" iconLeft={Brain}>
              Estudiar
            </Button>
            <Button
              href="/aprendizaje/ingles"
              variant="secondary"
              size="sm"
              iconLeft={MessageCircle}
            >
              English Speaking
            </Button>
          </>
        }
      />
      <LearningHubV2 catalog={catalog} assessmentProgress={assessmentProgress} />
    </div>
  );
}
