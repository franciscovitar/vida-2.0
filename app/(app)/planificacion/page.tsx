import { CalendarRange } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { PlanningWorkspace } from '@/components/planning/PlanningWorkspace';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { getAssessmentProgress } from '@/lib/data/assessment-progress-source';
import { getDailyPlanningView } from '@/lib/data/daily-planning-view-source';
import { getNotionDashboard } from '@/lib/data/notion-source';
import { getProjectsIntelligence } from '@/lib/data/projects-intelligence-source';
import { buildPlanningTaskCatalog } from '@/lib/planning/task-catalog';
import type { PlanningView } from '@/types/planning';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Planificación' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VIEWS = new Set<PlanningView>(['resumen', 'semana', 'tareas', 'proyectos']);

function resolveView(value: string | string[] | undefined): PlanningView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && VIEWS.has(raw as PlanningView) ? (raw as PlanningView) : 'resumen';
}

export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;
  const [dailyPlan, notion, assessments, projects] = await Promise.all([
    getDailyPlanningView(),
    getNotionDashboard(),
    getAssessmentProgress(),
    getProjectsIntelligence(),
  ]);

  const view = resolveView(params.view);
  const taskCatalog = buildPlanningTaskCatalog(notion);

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Planificación"
        description="Decidí dónde poner atención hoy y esta semana usando Facultad, Tareas, Proyectos, Calendar y capacidad real."
        icon={CalendarRange}
        domain="productivity"
      />

      <PlanningWorkspace
        view={view}
        dailyPlan={dailyPlan}
        notion={notion}
        assessments={assessments}
        projects={projects}
        taskCatalog={taskCatalog}
        writable={isWriteActionsEnabled()}
      />
    </div>
  );
}
