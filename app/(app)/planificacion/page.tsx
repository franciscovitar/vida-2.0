import { CalendarRange } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { MinimalPlanningOverview } from '@/components/planning/MinimalPlanningOverview';
import { PlanningWorkspace } from '@/components/planning/PlanningWorkspace';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { getAssessmentProgress } from '@/lib/data/assessment-progress-source';
import { getDailyOrientationV2View } from '@/lib/data/daily-orientation-v2-source';
import { getDailyPlanningView } from '@/lib/data/daily-planning-view-source';
import { getNotionDashboard } from '@/lib/data/notion-source';
import { getProjectsIntelligence } from '@/lib/data/projects-intelligence-source';
import { isDailyPlanningV2UiEnabled } from '@/lib/daily-planning/v2-config';
import { buildPlanningTaskCatalog } from '@/lib/planning/task-catalog';
import type { PlanningView } from '@/types/planning';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Planificación' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const V1_VIEWS = new Set<PlanningView>(['resumen', 'semana', 'tareas', 'proyectos']);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveV1View(value: string | string[] | undefined): PlanningView {
  const raw = first(value);
  return raw && V1_VIEWS.has(raw as PlanningView) ? (raw as PlanningView) : 'resumen';
}

export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;

  // Minimal ChatGPT-first V2: the website only renders the last saved
  // orientation. No live Google Calendar, second planner or source aggregation.
  // The certified V1 route below remains intact when this flag is OFF.
  if (isDailyPlanningV2UiEnabled()) {
    const orientation = await getDailyOrientationV2View();
    return (
      <div className={`${pageStyles.page} ${local.page}`}>
        <PageHeader
          title="Planificación"
          description="Tu último balance, prioridades y fechas seleccionadas en ChatGPT."
          icon={CalendarRange}
          domain="productivity"
        />
        <MinimalPlanningOverview orientation={orientation} />
      </div>
    );
  }

  const [dailyPlan, notion, assessments, projects] = await Promise.all([
    getDailyPlanningView(),
    getNotionDashboard(),
    getAssessmentProgress(),
    getProjectsIntelligence(),
  ]);
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
        view={resolveV1View(params.view)}
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
