import Link from 'next/link';
import { AlertTriangle, CheckSquare, FolderKanban, ListChecks, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { formatDuration } from '@/lib/format';
import type { CalendarTodayPreview } from '@/types/calendar';
import type { HoyNotionView, HoyProjectView, HoyTaskView } from '@/types/notion';
import type { TodaySourceStatus } from '@/types';

import styles from './HoyNotion.module.scss';

function priorityDomain(priority: HoyTaskView['priority']): 'danger' | 'projects' | 'neutral' {
  if (priority === 'Alta') return 'danger';
  if (priority === 'Media') return 'projects';
  return 'neutral';
}

function TaskRow({ task }: { task: HoyTaskView }) {
  return (
    <li className={styles.row}>
      <div className={styles.body}>
        <p className={styles.title}>{task.title}</p>
        <div className={styles.meta}>
          <span>{task.status}</span>
          {task.priority ? <span>{task.priority}</span> : null}
          {task.duration ? <span>{task.duration}</span> : null}
          {task.energy ? <span>Energía {task.energy}</span> : null}
          {task.areaName ? <span>{task.areaName}</span> : null}
          {task.projectName ? <span>{task.projectName}</span> : null}
          {task.relationUnavailable ? <span>Relación inaccesible</span> : null}
        </div>
        {task.blocker ? <p className={styles.blocker}>Bloqueo: {task.blocker}</p> : null}
      </div>
      {task.priority ? (
        <Badge domain={priorityDomain(task.priority)} variant="soft">
          {task.priority}
        </Badge>
      ) : null}
    </li>
  );
}

function ProjectRow({ project }: { project: HoyProjectView }) {
  return (
    <li
      className={styles.row}
      data-flag={project.blocked || project.withoutNextAction || project.dueSoon || undefined}
    >
      <div className={styles.body}>
        <p className={styles.title}>{project.name}</p>
        <div className={styles.meta}>
          {project.areaName ? <span>{project.areaName}</span> : null}
          <span className="tabular">{project.relatedTaskCount} tareas</span>
          {project.dueDate ? <span>Límite {project.dueDate}</span> : null}
          {project.reviewDate ? <span>Revisión {project.reviewDate}</span> : null}
          {project.withoutNextAction ? <span>Sin próxima acción</span> : null}
          {project.relationUnavailable ? <span>Relación inaccesible</span> : null}
        </div>
        {project.expectedResult ? <p className={styles.sub}>{project.expectedResult}</p> : null}
        {project.nextAction ? <p className={styles.sub}>Próxima: {project.nextAction}</p> : null}
        {project.blocker ? <p className={styles.blocker}>Bloqueo: {project.blocker}</p> : null}
      </div>
    </li>
  );
}

function SourcesStrip({ sources }: { sources: TodaySourceStatus[] }) {
  return (
    <ul className={styles.sources} aria-label="Estado de fuentes">
      {sources.map((source) => (
        <li key={source.id} data-mode={source.mode} data-ready={source.ready}>
          <span className={styles['source-label']}>{source.label}</span>
          <span className={styles['source-mode']}>
            {source.mode === 'live'
              ? 'listo'
              : source.mode === 'mock'
                ? 'fallback mock'
                : source.mode === 'partial'
                  ? 'parcial'
                  : source.mode === 'fallback'
                    ? 'fallback'
                    : 'sin conexión'}
          </span>
        </li>
      ))}
      {sources.some((s) => s.ready && s.mode === 'live') &&
      sources.some((s) => !s.ready || s.mode !== 'live') ? (
        <li data-mode="partial">
          <span className={styles['source-label']}>Integración</span>
          <span className={styles['source-mode']}>parcial</span>
        </li>
      ) : null}
    </ul>
  );
}

export function HoyNotionPanel({
  notion,
  sources,
  calendar,
}: {
  notion: HoyNotionView;
  sources: TodaySourceStatus[];
  calendar: CalendarTodayPreview;
}) {
  const s = notion.summary;

  return (
    <div className={styles.stack}>
      <SourcesStrip sources={sources} />

      {notion.notice ? (
        <p className={styles.notice} role="status">
          {notion.notice}
        </p>
      ) : null}

      <Card compact aria-labelledby="hoy-ops-title">
        <SectionHeader
          id="hoy-ops-title"
          title="Resumen operativo"
          description="Compromisos, tareas y alertas · solo lectura."
          icon={ListChecks}
          domain="tasks"
        />
        <ul className={styles.summary}>
          <li>
            <strong className="tabular">{calendar.todayEvents.length}</strong>
            <span>Eventos</span>
          </li>
          <li>
            <strong className="tabular">{formatDuration(calendar.occupiedMinutes)}</strong>
            <span>Ocupadas</span>
          </li>
          <li>
            <strong className="tabular">{calendar.conflicts.length}</strong>
            <span>Conflictos</span>
          </li>
          <li>
            <strong>{calendar.nextEvent?.title ?? '—'}</strong>
            <span>Próximo evento</span>
          </li>
          <li>
            <strong className="tabular">{s.dueToday}</strong>
            <span>Tareas hoy</span>
          </li>
          <li>
            <strong className="tabular">{s.overdue}</strong>
            <span>Vencidas</span>
          </li>
          <li>
            <strong className="tabular">{s.blocked}</strong>
            <span>Bloqueadas</span>
          </li>
          <li>
            <strong className="tabular">{s.activeProjects}</strong>
            <span>Proyectos</span>
          </li>
        </ul>
        <div className={styles.links}>
          <Link href="/agenda?view=today">Agenda</Link>
          <Link href="/tareas">Tareas</Link>
          <Link href="/proyectos">Proyectos</Link>
          <Link href="/habitos">Hábitos</Link>
          <Link href="/salud">Salud</Link>
          <Link href="/productividad">Productividad</Link>
        </div>
      </Card>

      <Card compact aria-labelledby="hoy-suggest-title">
        <SectionHeader
          id="hoy-suggest-title"
          title="Próximas acciones sugeridas por reglas"
          description="Orden fijo · sin IA."
          icon={Sparkles}
          domain="projects"
        />
        {notion.suggestedActions.length === 0 ? (
          <p className={styles.empty}>Sin acciones sugeridas por las reglas actuales.</p>
        ) : (
          <ol className={styles.suggest}>
            {notion.suggestedActions.map((action) => (
              <li key={action.id}>
                <Link href={action.href} className={styles['suggest-link']}>
                  {action.title}
                </Link>
                <span className={styles['suggest-reason']}>{action.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card compact aria-labelledby="hoy-today-title">
        <SectionHeader
          id="hoy-today-title"
          title="Prioridades de hoy"
          description="Fecha = hoy (AR) · no hechas."
          icon={CheckSquare}
          domain="tasks"
        />
        {notion.dueToday.length === 0 ? (
          <p className={styles.empty}>No hay tareas con fecha para hoy.</p>
        ) : (
          <ul className={styles.list}>
            {notion.dueToday.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </Card>

      <Card compact aria-labelledby="hoy-overdue-title">
        <SectionHeader
          id="hoy-overdue-title"
          title="Tareas vencidas"
          description="Fecha pasada · no hechas · no «Algún día»."
          icon={AlertTriangle}
          domain="danger"
        />
        {notion.overdue.length === 0 ? (
          <p className={styles.empty}>No hay tareas vencidas.</p>
        ) : (
          <ul className={styles.list}>
            {notion.overdue.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </Card>

      <Card compact aria-labelledby="hoy-wip-title">
        <SectionHeader
          id="hoy-wip-title"
          title="En progreso y bloqueadas"
          description="Sin duplicar las de hoy o vencidas."
          domain="tasks"
        />
        {notion.inProgress.length === 0 && notion.blocked.length === 0 ? (
          <p className={styles.empty}>
            Nada en progreso ni bloqueado fuera de las secciones anteriores.
          </p>
        ) : (
          <div className={styles.split}>
            {notion.inProgress.length > 0 ? (
              <div>
                <p className={styles.group}>En progreso</p>
                <ul className={styles.list}>
                  {notion.inProgress.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </ul>
              </div>
            ) : null}
            {notion.blocked.length > 0 ? (
              <div>
                <p className={styles.group}>Bloqueadas</p>
                <ul className={styles.list}>
                  {notion.blocked.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card compact aria-labelledby="hoy-projects-title">
        <SectionHeader
          id="hoy-projects-title"
          title="Proyectos activos"
          description="Solo estado Activo."
          icon={FolderKanban}
          domain="projects"
        />
        {notion.activeProjects.length === 0 ? (
          <p className={styles.empty}>No hay proyectos activos.</p>
        ) : (
          <ul className={styles.list}>
            {notion.activeProjects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
