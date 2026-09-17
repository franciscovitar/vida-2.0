import { CalendarDays, GraduationCap, ListChecks, Rocket, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';

import { DailyPlanningPanel } from '@/components/dashboard/DailyPlanningPanel';
import { TaskManager } from '@/components/planning/TaskManager';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  selectAttentionTasks,
  selectPlanningAssessments,
  selectPlanningProjects,
  selectWeekTasks,
} from '@/lib/planning/overview';
import type { AssessmentProgressRead } from '@/types/assessment-progress';
import type { DailyPlanningView } from '@/types/daily-planning-view';
import type { NotionDashboardData } from '@/types/notion';
import type { PlanningTaskCatalog, PlanningView } from '@/types/planning';
import type { ProjectsIntelligenceData } from '@/types/projects-intelligence';

import styles from './PlanningWorkspace.module.scss';

const TABS: { key: PlanningView; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'semana', label: 'Semana' },
  { key: 'tareas', label: 'Tareas' },
  { key: 'proyectos', label: 'Proyectos' },
];

function progressLabel(value: number | null): string {
  return value === null ? 'Sin medir' : `${Math.round(value)}%`;
}

function etaLabel(low: number | null, high: number | null): string | null {
  if (low === null && high === null) return null;
  if (low !== null && high !== null) return `${low}–${high} min restantes`;
  return `${low ?? high} min restantes aprox.`;
}

function AssessmentCards({ assessments }: { assessments: AssessmentProgressRead }) {
  const items = selectPlanningAssessments(assessments.snapshots);
  if (items.length === 0) {
    return <p className={styles.empty}>No hay evaluaciones activas o planificadas verificables.</p>;
  }

  return (
    <div className={styles.cards}>
      {items.map((assessment) => {
        const payload = assessment.payload;
        return (
          <article className={styles['attention-card']} key={assessment.assessmentId}>
            <div className={styles['card-top']}>
              <div>
                <strong>{payload.name}</strong>
                <p>{assessment.subjectId}</p>
              </div>
              <span>{assessment.assessmentDate ?? 'Fecha sin confirmar'}</span>
            </div>
            <div className={styles['progress-line']}>
              <span>Preparación</span>
              <strong>{progressLabel(payload.progressPercent)}</strong>
            </div>
            {payload.progressPercent !== null ? (
              <ProgressBar
                value={payload.progressPercent}
                max={100}
                domain="learning"
                label={`Preparación ${payload.progressPercent}%`}
              />
            ) : null}
            <div className={styles.meta}>
              <span>Readiness: {payload.readinessBand}</span>
              {etaLabel(payload.remainingMinutesLow, payload.remainingMinutesHigh) ? (
                <span>{etaLabel(payload.remainingMinutesLow, payload.remainingMinutesHigh)}</span>
              ) : null}
              <span>Confianza: {payload.progressConfidence}</span>
            </div>
            {payload.nextBestActivity ? (
              <p className={styles.next}><b>Próximo:</b> {payload.nextBestActivity}</p>
            ) : null}
            {payload.criticalGaps.length > 0 ? (
              <p className={styles.gaps}>Gap: {payload.criticalGaps.slice(0, 2).join(' · ')}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function TaskPressure({ notion }: { notion: NotionDashboardData }) {
  const tasks = selectAttentionTasks(notion.tasks);
  if (tasks.length === 0) return <p className={styles.empty}>No hay presión operativa destacable.</p>;
  return (
    <ul className={styles.rows}>
      {tasks.map((task) => (
        <li key={task.id}>
          <div>
            <strong>{task.title}</strong>
            <span>
              {task.status}
              {task.priority ? ` · ${task.priority}` : ''}
              {task.duration ? ` · ${task.duration}` : ''}
            </span>
          </div>
          <div className={styles['row-side']}>
            <span>{task.date ? `Fecha ${task.date}` : 'Sin fecha'}</span>
            {task.project?.available ? <span>{task.project.name}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProjectPressure({ projects }: { projects: ProjectsIntelligenceData }) {
  const items = projects.status === 'ready' ? selectPlanningProjects(projects.projects) : [];
  const waiting = projects.status === 'ready' ? projects.projects.filter((p) => p.status === 'En espera').length : 0;

  return (
    <>
      {items.length === 0 ? (
        <p className={styles.empty}>No hay proyectos activos o bloqueados compitiendo por foco.</p>
      ) : (
        <div className={styles.cards}>
          {items.map((project) => (
            <article className={styles['attention-card']} key={project.id}>
              <div className={styles['card-top']}>
                <strong>{project.name}</strong>
                <span>{project.status}</span>
              </div>
              {project.progress.measurable ? (
                <>
                  <div className={styles['progress-line']}>
                    <span>Progreso por hitos</span>
                    <strong>{Math.round(project.progress.percent)}%</strong>
                  </div>
                  <ProgressBar
                    value={project.progress.completedWeight}
                    max={project.progress.totalWeight}
                    domain="projects"
                    label={`Progreso ${project.progress.percent}%`}
                  />
                </>
              ) : (
                <p className={styles.muted}>Progreso todavía no medible.</p>
              )}
              <p className={styles.next}>
                <b>Próxima acción:</b>{' '}
                {project.nextAction?.available ? project.nextAction.name : 'Sin próxima acción resoluble'}
              </p>
              {project.dueDate ? <p className={styles['meta-line']}>Límite real: {project.dueDate}</p> : null}
              {project.blocker ? <p className={styles.gaps}>Bloqueo: {project.blocker}</p> : null}
            </article>
          ))}
        </div>
      )}
      {waiting > 0 ? (
        <p className={styles.quiet}>
          {waiting} proyecto{waiting === 1 ? '' : 's'} en espera no compiten por foco diario.{' '}
          <Link href="/proyectos">Revisar portfolio</Link>
        </p>
      ) : null}
    </>
  );
}

function WeekView({
  dailyPlan,
  notion,
  assessments,
  projects,
}: {
  dailyPlan: DailyPlanningView;
  notion: NotionDashboardData;
  assessments: AssessmentProgressRead;
  projects: ProjectsIntelligenceData;
}) {
  const weekTasks = selectWeekTasks(notion.tasks, dailyPlan.targetDate);
  const activeProjects = projects.status === 'ready' ? selectPlanningProjects(projects.projects) : [];

  return (
    <div className={styles.stack}>
      <Card>
        <SectionHeader title="Evaluaciones próximas" description="Fechas y carga restante verificadas; sin probabilidades inventadas." icon={GraduationCap} domain="learning" />
        <AssessmentCards assessments={assessments} />
      </Card>
      <Card>
        <SectionHeader title="Tareas con fecha en 7 días" description="Fecha relevante, no se interpreta automáticamente como deadline duro." icon={ListChecks} domain="tasks" />
        {weekTasks.length === 0 ? <p className={styles.empty}>Sin tareas fechadas en los próximos 7 días.</p> : (
          <ul className={styles.rows}>
            {weekTasks.map((task) => (
              <li key={task.id}>
                <div><strong>{task.title}</strong><span>{task.status}{task.duration ? ` · ${task.duration}` : ''}</span></div>
                <span>{task.date}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <SectionHeader title="Compromisos y marcadores" description="Calendar limita capacidad; un hueco libre no se trata como capacidad garantizada." icon={CalendarDays} domain="productivity" />
        <div className={styles['two-cols']}>
          <section>
            <h3>Hoy con horario</h3>
            {dailyPlan.fixedCommitments.length === 0 ? <p className={styles.empty}>Sin compromisos horarios verificables hoy.</p> : (
              <ul className={styles.simple}>
                {dailyPlan.fixedCommitments.map((event, index) => <li key={`${event.title}-${index}`}><b>{event.startTime ?? '—'}–{event.endTime ?? '—'}</b> {event.title}</li>)}
              </ul>
            )}
          </section>
          <section>
            <h3>Próximas fechas</h3>
            {dailyPlan.dateMarkers.length === 0 ? <p className={styles.empty}>Sin marcadores próximos.</p> : (
              <ul className={styles.simple}>
                {dailyPlan.dateMarkers.map((marker, index) => <li key={`${marker.title}-${index}`}><b>{marker.date}</b> {marker.title}</li>)}
              </ul>
            )}
          </section>
        </div>
      </Card>
      <Card>
        <SectionHeader title="Proyectos que sí compiten por foco" description="Solo Activo/Bloqueado. Los proyectos En espera quedan fuera del radar diario." icon={Rocket} domain="projects" />
        {activeProjects.length === 0 ? <p className={styles.empty}>Ningún proyecto activo o bloqueado.</p> : (
          <ul className={styles.rows}>
            {activeProjects.map((project) => (
              <li key={project.id}>
                <div><strong>{project.name}</strong><span>{project.status}</span></div>
                <span>{project.progress.measurable ? `${Math.round(project.progress.percent)}%` : 'Sin medir'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function PlanningWorkspace({
  view,
  dailyPlan,
  notion,
  assessments,
  projects,
  taskCatalog,
  writable,
}: {
  view: PlanningView;
  dailyPlan: DailyPlanningView;
  notion: NotionDashboardData;
  assessments: AssessmentProgressRead;
  projects: ProjectsIntelligenceData;
  taskCatalog: PlanningTaskCatalog;
  writable: boolean;
}) {
  return (
    <div className={styles.workspace}>
      <nav className={styles.tabs} aria-label="Vistas de planificación">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === 'resumen' ? '/planificacion' : `/planificacion?view=${tab.key}`}
            data-active={view === tab.key ? 'true' : 'false'}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === 'resumen' ? (
        <div className={styles.stack}>
          <DailyPlanningPanel plan={dailyPlan} />
          <div className={styles.grid}>
            <Card>
              <SectionHeader title="Facultad" description="Evaluaciones activas/planificadas ordenadas por fecha verificable." icon={GraduationCap} domain="learning" />
              <AssessmentCards assessments={assessments} />
            </Card>
            <Card>
              <SectionHeader title="Presión operativa" description="Bloqueos, fechas relevantes, trabajo en progreso y prioridad declarada." icon={SlidersHorizontal} domain="tasks" />
              <TaskPressure notion={notion} />
            </Card>
          </div>
          <Card>
            <SectionHeader title="Proyectos" description="Solo Activo/Bloqueado entra al foco. En espera permanece preservado sin ruido diario." icon={Rocket} domain="projects" />
            <ProjectPressure projects={projects} />
          </Card>
          <p className={styles['capacity-note']}>
            Planificación deja margen deliberadamente: Calendar libre no significa energía disponible y no se intenta llenar el 100% del día.
          </p>
        </div>
      ) : null}

      {view === 'semana' ? (
        <WeekView dailyPlan={dailyPlan} notion={notion} assessments={assessments} projects={projects} />
      ) : null}

      {view === 'tareas' ? (
        <Card>
          <SectionHeader title="Tareas" description="Crear, editar y enviar a papelera directamente sobre la fuente canónica de Notion." icon={ListChecks} domain="tasks" />
          <TaskManager catalog={taskCatalog} writable={writable} />
        </Card>
      ) : null}

      {view === 'proyectos' ? (
        <Card>
          <SectionHeader title="Proyectos para planificar" description="Vista compacta. La definición, arquitectura y portfolio completo siguen en Proyectos." icon={Rocket} domain="projects" />
          <ProjectPressure projects={projects} />
          <div className={styles['project-link']}><Link href="/proyectos">Abrir Projects Intelligence completo →</Link></div>
        </Card>
      ) : null}
    </div>
  );
}
