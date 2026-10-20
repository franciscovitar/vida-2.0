import { BookmarkCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { SessionContinuityBoard } from '@/components/planning/SessionContinuityBoard';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getAssessmentProgressForLearningV2 } from '@/lib/data/assessment-progress-source';
import { getProjectsIntelligence } from '@/lib/data/projects-intelligence-source';
import { isDailyPlanningV2UiEnabled } from '@/lib/daily-planning/v2-config';
import { buildSessionContinuityView } from '@/lib/session-continuity/view';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'En qué quedé' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function EnQueQuedePage() {
  await requireAuthorizedSession();
  // This new route is available only when its parent V2 Planning experience
  // was explicitly enabled. No V1 fallback silently reaches new sources.
  if (!isDailyPlanningV2UiEnabled()) {
    return (
      <div className={pageStyles.page}>
        <PageHeader
          title="En qué quedé"
          description="Esta vista todavía no está habilitada."
          icon={BookmarkCheck}
          domain="productivity"
        />
      </div>
    );
  }

  const [projects, academic] = await Promise.allSettled([
    getProjectsIntelligence(),
    getAssessmentProgressForLearningV2(),
  ]);
  const view = buildSessionContinuityView(
    projects.status === 'fulfilled' ? projects.value : null,
    academic.status === 'fulfilled' ? academic.value : null,
  );

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="En qué quedé"
        description="Retomá tus proyectos y materias desde el último paso registrado, sin otra lista de tareas."
        icon={BookmarkCheck}
        domain="productivity"
      />
      <SessionContinuityBoard view={view} />
    </div>
  );
}
