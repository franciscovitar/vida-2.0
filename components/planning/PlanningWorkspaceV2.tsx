import { CalendarDays, GraduationCap, ListChecks, Rocket } from 'lucide-react';
import Link from 'next/link';

import {
  DailyAttentionPanel,
  DailyRealityReviewPanel,
} from '@/components/planning/DailyOrientationPanels';
import { TaskManager } from '@/components/planning/TaskManager';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { selectPlanningProjects, selectWeekTasks } from '@/lib/planning/overview';
import { classifyWeekAssessments } from '@/lib/planning/week-v2';
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
  const academic = classifyWeekAssessments(assessments.snapshots, dailyPlan.targetDate);
  const activeProjects =
    projects.status === 'ready' ? selectPlanningProjects(projects.projects) : [];
  const assessmentUnavailable =
    assessments.status === 'unavailable' || assessments.status === 'invalid';
  const projectsUnavailable = projects.status !== 'ready' && projects.status !== 'empty';
  const topDates = orientation.upcoming.slice(0, 3);
  const extraDates = orientation.upcoming.slice(3);

  return (
    <div className={styles.stack}>
      <Card>
        <SectionHeader
          title="Semana en contexto"
          description="Qué necesita atención en los próximos siete días, sin inventar ritmo ni balances."
          icon={CalendarDays}
          domain="productivity"
        />
        {topDates.length === 0 ? (
          <p className={styles.empty}>
            Sin fechas V2 prioritarias verificadas. Esto no significa que Calendar o las demás
            fuentes estén libres de compromisos.
          </p>
        ) : (
          <ul className={styles.rows}>
            {topDates.map((item, index) => (
              <li key={`${item.kind}-${item.title}-${index}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.reason}</span>
                </div>
                <span>{item.date}</span>
              </li>
            ))}
          </ul>
        )}
        {extraDates.length > 0 ? (
          <details className={styles['week-more']}>
            <summary>Ver {extraDates.length} fechas adicionales</summary>
            <ul className={styles.rows}>
              {extraDates.map((item, index) => (
                <li key={`${item.kind}-${item.title}-extra-${index}`}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.reason}</span>
                  </div>
                  <span>{item.date}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          title="Facultad: próximos siete días"
          description="Evaluaciones activas de esta ventana. Las pasadas no se tratan como próximas."
          icon={GraduationCap}
          domain="learning"
          action={<Link href="/aprendizaje/estudio">Ver materias →</Link>}
        />
        {assessmentUnavailable ? (
          <p className={styles.empty}>Assessment Progress no está disponible o es inválido.</p>
        ) : academic.week.length === 0 ? (
          <p className={styles.empty}>Sin evaluaciones con fecha confirmada en esta ventana.</p>
        ) : (
          <ul className={styles.rows}>
            {academic.week.slice(0, 3).map((assessment) => (
              <li key={assessment.assessmentId}>
                <div>
                  <strong>{assessment.payload.name}</strong>
                  <span>
                    {assessment.subjectId} · preparación{' '}
                    {assessment.payload.progressPercent === null
                      ? 'sin medir'
                      : `${assessment.payload.progressPercent}%`}
                    {' · '}readiness {assessment.payload.readinessBand}
                  </span>
                </div>
                <span>{assessment.assessmentDate}</span>
              </li>
            ))}
          </ul>
        )}
        {!assessmentUnavailable &&
        (academic.week.length > 3 || academic.past.length > 0 || academic.undated.length > 0) ? (
          <details className={styles['week-more']}>
            <summary>Ver otras evaluaciones y fechas a reconciliar</summary>
            <ul className={styles.rows}>
              {academic.week.slice(3).map((assessment) => (
                <li key={assessment.assessmentId}>
                  <div>
                    <strong>{assessment.payload.name}</strong>
                    <span>{assessment.subjectId} · mismo horizonte semanal</span>
                  </div>
                  <span>{assessment.assessmentDate}</span>
                </li>
              ))}
              {academic.past.map((assessment) => (
                <li key={assessment.assessmentId}>
                  <div>
                    <strong>{assessment.payload.name}</strong>
                    <span>Fecha pasada aún activa en la fuente: requiere reconciliación.</span>
                  </div>
                  <span>{assessment.assessmentDate}</span>
                </li>
              ))}
              {academic.undated.map((assessment) => (
                <li key={assessment.assessmentId}>
                  <div>
                    <strong>{assessment.payload.name}</strong>
                    <span>Fecha no confirmada; no se asigna urgencia inventada.</span>
                  </div>
                  <span>Sin fecha</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          title="Acciones con fecha"
          description="Sólo tareas abiertas en esta ventana. Fecha sin tipo sigue siendo ambigua."
          icon={ListChecks}
          domain="tasks"
          action={<Link href="/planificacion?view=acciones">Ver acciones →</Link>}
        />
        {weekTasks.length === 0 ? (
          <p className={styles.empty}>Sin tareas fechadas verificables en los próximos siete días.</p>
        ) : (
          <ul className={styles.rows}>
            {weekTasks.slice(0, 3).map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.status} · {task.dateType ?? 'Fecha sin tipo'}</span>
                </div>
                <span>{task.date}</span>
              </li>
            ))}
          </ul>
        )}
        {weekTasks.length > 3 ? (
          <details className={styles['week-more']}>
            <summary>Ver {weekTasks.length - 3} tareas adicionales</summary>
            <ul className={styles.rows}>
              {weekTasks.slice(3).map((task) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.status} · {task.dateType ?? 'Fecha sin tipo'}</span>
                  </div>
                  <span>{task.date}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          title="Frentes de proyectos"
          description="Bloqueados y activos; el avance se mide exclusivamente por hitos canónicos."
          icon={Rocket}
          domain="projects"
          action={<Link href="/proyectos">Ver portfolio →</Link>}
        />
        {projectsUnavailable ? (
          <p className={styles.empty}>Projects Intelligence no está disponible; no se infiere ritmo.</p>
        ) : activeProjects.length === 0 ? (
          <p className={styles.empty}>No hay proyectos activos o bloqueados verificables.</p>
        ) : (
          <ul className={styles.rows}>
            {activeProjects.slice(0, 3).map((project) => (
              <li key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <span>
                    {project.status}
                    {project.blocker ? ` · Bloqueo: ${project.blocker}` : ''}
                  </span>
                  <span>
                    {project.nextAction?.available && project.nextAction.name
                      ? `Próxima acción: ${project.nextAction.name}`
                      : 'Próxima acción no confirmada'}
                  </span>
                </div>
                <span>
                  {project.progress.measurable ? `${project.progress.percent}%` : 'Sin medir'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {activeProjects.length > 3 ? (
          <details className={styles['week-more']}>
            <summary>Ver {activeProjects.length - 3} proyectos adicionales</summary>
            <ul className={styles.rows}>
              {activeProjects.slice(3).map((project) => (
                <li key={project.id}>
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.status}</span>
                  </div>
                  <span>
                    {project.progress.measurable ? `${project.progress.percent}%` : 'Sin medir'}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      {orientation.lifeSignals.length > 0 ? (
        <Card>
          <SectionHeader
            title="Vida y recuperación"
            description="Contexto del último review, no tendencia semanal ni diagnóstico."
            domain="health"
          />
          <ul className={styles.rows}>
            {orientation.lifeSignals.slice(0, 3).map((signal, index) => (
              <li key={`${signal.kind}-${index}`}>
                <div>
                  <strong>{signal.summary}</strong>
                  <span>Confianza {signal.confidence}</span>
                </div>
                <span>{signal.level}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className={styles['week-source-note']}>
        El balance real de atención entre materias, proyectos y ocio requiere historial de ejecución
        suficiente. Mientras no exista evidencia semanal confiable, la vista muestra compromisos,
        progreso verificado y contexto disponible, sin convertir horas ni actividad en dominio.
      </p>
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
  dateSemanticsV2,
}: {
  view: PlanningViewV2;
  orientation: DailyOrientationView;
  dailyPlan: DailyPlanningView;
  notion: NotionDashboardData;
  assessments: AssessmentProgressRead;
  projects: ProjectsIntelligenceData;
  taskCatalog: PlanningTaskCatalog;
  writable: boolean;
  dateSemanticsV2: boolean;
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
          <TaskManager
            catalog={taskCatalog}
            writable={writable}
            dateSemanticsV2={dateSemanticsV2}
          />
        </Card>
      ) : null}
    </div>
  );
}
