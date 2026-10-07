import { CalendarDays, GraduationCap, ListChecks, Rocket } from 'lucide-react';
import Link from 'next/link';

import {
  DailyAttentionPanel,
  DailyRealityReviewPanel,
} from '@/components/planning/DailyOrientationPanels';
import { TaskManager } from '@/components/planning/TaskManager';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  selectPlanningAssessments,
  selectPlanningProjects,
  selectWeekTasks,
} from '@/lib/planning/overview';
import type { AssessmentProgressRead } from '@/types/assessment-progress';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';
import type { DailyPlanningView } from '@/types/daily-planning-view';
import type { NotionDashboardData } from '@/types/notion';
import type { PlanningTaskCatalog, PlanningViewV2 } from '@/types/planning';
import type { ProjectsIntelligenceData } from '@/types/projects-intelligence';

import styles from './PlanningWorkspace.module.scss';

const TABS: { key: PlanningViewV2; label: string }[] = [
  { key: 'revision', label: 'Revisión' },
  { key: 'prioridades', label: 'Prioridades' },
  { key: 'semana', label: 'Semana' },
  { key: 'acciones', label: 'Acciones' },
];

function WeekView({
  dailyPlan,
  notion,
  assessments,
  projects,
  orientation,
}: {
  dailyPlan: DailyPlanningView;
  notion: NotionDashboardData;
  assessments: AssessmentProgressRead;
  projects: ProjectsIntelligenceData;
  orientation: DailyOrientationView;
}) {
  const weekTasks = selectWeekTasks(notion.tasks, notion.projects, dailyPlan.targetDate);
  const academic = selectPlanningAssessments(assessments.snapshots);
  const activeProjects =
    projects.status === 'ready' ? selectPlanningProjects(projects.projects) : [];

  return (
    <div className={styles.stack}>
      {orientation.upcoming.length > 0 ? (
        <Card>
          <SectionHeader
            title="Próximamente"
            description="Sólo señales V2 capaces de cambiar una decisión."
            icon={CalendarDays}
            domain="productivity"
          />
          <ul className={styles.rows}>
            {orientation.upcoming.map((item, index) => (
              <li key={`${item.kind}-${item.title}-${index}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.reason}</span>
                </div>
                <span>{item.date}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionHeader
          title="Facultad"
          description="Evaluaciones activas con estado verificable; desconocido no significa 0%."
          icon={GraduationCap}
          domain="learning"
        />
        {academic.length === 0 ? (
          <p className={styles.empty}>No hay evaluaciones activas verificables.</p>
        ) : (
          <ul className={styles.rows}>
            {academic.map((assessment) => (
              <li key={assessment.assessmentId}>
                <div>
                  <strong>{assessment.payload.name}</strong>
                  <span>
                    {assessment.subjectId} · readiness {assessment.payload.readinessBand}
                  </span>
                </div>
                <span>{assessment.assessmentDate ?? 'Fecha sin confirmar'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Acciones con fecha"
          description="La fecha legacy sigue siendo ambigua hasta que Tipo de fecha esté migrado."
          icon={ListChecks}
          domain="tasks"
        />
        {weekTasks.length === 0 ? (
          <p className={styles.empty}>Sin tareas fechadas en los próximos 7 días.</p>
        ) : (
          <ul className={styles.rows}>
            {weekTasks.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.status}</span>
                </div>
                <span>{task.date}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Proyectos que compiten"
          description="Sólo Activo/Bloqueado; el portfolio completo sigue en Proyectos."
          icon={Rocket}
          domain="projects"
        />
        {activeProjects.length === 0 ? (
          <p className={styles.empty}>Ningún proyecto activo o bloqueado compite esta semana.</p>
        ) : (
          <ul className={styles.rows}>
            {activeProjects.map((project) => (
              <li key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{project.status}</span>
                </div>
                <span>
                  {project.progress.measurable
                    ? `${Math.round(project.progress.percent)}%`
                    : 'Sin medir'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles['project-link']}>
          <Link href="/proyectos">Abrir Proyectos →</Link>
        </div>
      </Card>
    </div>
  );
}

export function PlanningWorkspaceV2({
  view,
  orientation,
  dailyPlan,
  notion,
  assessments,
  projects,
  taskCatalog,
  writable,
}: {
  view: PlanningViewV2;
  orientation: DailyOrientationView;
  dailyPlan: DailyPlanningView;
  notion: NotionDashboardData;
  assessments: AssessmentProgressRead;
  projects: ProjectsIntelligenceData;
  taskCatalog: PlanningTaskCatalog;
  writable: boolean;
}) {
  return (
    <div className={styles.workspace}>
      <nav className={styles.tabs} aria-label="Vistas de planificación V2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === 'revision' ? '/planificacion' : `/planificacion?view=${tab.key}`}
            data-active={view === tab.key ? 'true' : 'false'}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === 'revision' ? <DailyRealityReviewPanel orientation={orientation} /> : null}
      {view === 'prioridades' ? <DailyAttentionPanel orientation={orientation} /> : null}
      {view === 'semana' ? (
        <WeekView
          dailyPlan={dailyPlan}
          notion={notion}
          assessments={assessments}
          projects={projects}
          orientation={orientation}
        />
      ) : null}
      {view === 'acciones' ? (
        <Card>
          <SectionHeader
            title="Acciones"
            description="Tareas operativas sobre la fuente canónica; Planning no crea una segunda lista."
            icon={ListChecks}
            domain="tasks"
          />
          <TaskManager catalog={taskCatalog} writable={writable} />
        </Card>
      ) : null}
    </div>
  );
}
