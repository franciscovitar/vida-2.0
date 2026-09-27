import { Brain, ChevronLeft, FlaskConical } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { StudyCatalog } from '@/components/study-engine/StudyCatalog';
import { Button } from '@/components/ui/Button';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getAssessmentProgress } from '@/lib/data/assessment-progress-source';
import { getUniversityStudyCatalog } from '@/lib/study-engine/catalog-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Modo estudio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function StudyEnginePage() {
  await requireAuthorizedSession();

  const [catalog, assessmentProgress] = await Promise.all([
    getUniversityStudyCatalog(),
    getAssessmentProgress(),
  ]);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Modo estudio"
        description="Tus materias, evaluaciones y temas conectados al Learning OS."
        icon={Brain}
        domain="learning"
        action={
          <>
            <Button href="/aprendizaje/estudio/demo" variant="secondary" size="sm" iconLeft={FlaskConical}>
              Demo
            </Button>
            <Button href="/aprendizaje" variant="ghost" size="sm" iconLeft={ChevronLeft}>
              Aprendizaje
            </Button>
          </>
        }
      />
      <StudyCatalog catalog={catalog} assessmentProgress={assessmentProgress} />
    </div>
  );
}
