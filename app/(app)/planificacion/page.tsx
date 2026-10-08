import { CalendarRange } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { PlanningWorkspace } from '@/components/planning/PlanningWorkspace';
import { PlanningWorkspaceV2 } from '@/components/planning/PlanningWorkspaceV2';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { getAssessmentProgress } from '@/lib/data/assessment-progress-source';
import { getDailyOrientationV2View } from '@/lib/data/daily-orientation-v2-source';
import { getDailyPlanningView } from '@/lib/data/daily-planning-view-source';
import { getNotionDashboard } from '@/lib/data/notion-source';
import { getProjectsIntelligence } from '@/lib/data/projects-intelligence-source';
import {
  isDailyPlanningV2UiEnabled,
  isTaskDateSemanticsV2Enabled,
} from '@/lib/daily-planning/v2-config';
import { buildPlanningTaskCatalog } from '@/lib/planning/task-catalog';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';
import type { PlanningView, PlanningViewV2 } from '@/types/planning';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Planificación' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const V1_VIEWS = new Set<PlanningView>(['resumen', 'semana', 'tareas', 'proyectos']);
const V2_VIEWS = new Set<PlanningViewV2>(['revision', 'prioridades', 'semana', 'acciones']);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveV1View(value: string | string[] | undefined): PlanningView {
  const raw = first(value);
  return raw && V1_VIEWS.has(raw as PlanningView) ? (raw as PlanningView) : 'resumen';
}

function resolveV2View(value: string | string[] | undefined): PlanningViewV2 {
  const raw = first(value);
  if (raw && V2_VIEWS.has(raw as PlanningViewV2)) return raw as PlanningViewV2;
  if (raw === 'tareas') return 'acciones';
  if (raw === 'proyectos') return 'prioridades';
  return 'revision';
}

export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;
  const v2Enabled = isDailyPlanningV2UiEnabled();
  const taskDateSemanticsV2 = isTaskDateSemanticsV2Enabled();

  const [dailyPlan, orientation, notion, assessments, projects] = await Promise.all([
    getDailyPlanningView(),
    v2Enabled ? getDailyOrientationV2View() : Promise.resolve<DailyOrientationView | null>(null),
    getNotionDashboard(),
    getAssessmentProgress(),
    getProjectsIntelligence(),
  ]);

  const taskCatalog = buildPlanningTaskCatalog(notion);

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Planificación"
        description={
          v2Enabled
            ? 'Revisá qué pasó, decidí qué merece atención y mantené la semana sin convertir tu vida en una agenda.'
            : 'Decidí dónde poner atención hoy y esta semana usando Facultad, Tareas, Proyectos, Calendar y capacidad real.'
        }
        icon={CalendarRange}
        domain="productivity"
      />

      {v2Enabled && orientation ? (
        <PlanningWorkspaceV2
          view={resolveV2View(params.view)}
          orientation={orientation}
          dailyPlan={dailyPlan}
          notion={notion}
          assessments={assessments}
          projects={projects}
          taskCatalog={taskCatalog}
          writable={isWriteActionsEnabled()}
          dateSemanticsV2={taskDateSemanticsV2}
        />
      ) : (
        <PlanningWorkspace
          view={resolveV1View(params.view)}
          dailyPlan={dailyPlan}
          notion={notion}
          assessments={assessments}
          projects={projects}
          taskCatalog={taskCatalog}
          writable={isWriteActionsEnabled()}
        />
      )}
    </div>
  );
}
