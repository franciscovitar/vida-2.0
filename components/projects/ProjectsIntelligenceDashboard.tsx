/**
 * Panel Projects Intelligence V1 (`/proyectos`).
 *
 * Presentación pura: todo el razonamiento vive en
 * `lib/projects/intelligence-view.ts` y en el lector fail-closed
 * (`lib/data/projects-intelligence-source.ts`). Este componente solo decide
 * cómo mostrar lo que ya viene resuelto — nunca genera un ranking, una
 * recomendación ni un proyecto simulado.
 */
import { CircleAlert, Info } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  buildProjectsIntelligenceView,
  FAIL_CLOSED_REASSURANCE,
  MILESTONE_WEIGHT_NOTE,
  MULTIPLE_NEXT_ACTION_WARNING,
  PI_NO_SNAPSHOT_LABEL,
  PI_STALE_LABEL,
  PROGRESS_UNMEASURABLE_LABEL,
  PROGRESS_VERIFIED_LABEL,
  QUALITY_ALL_CLEAR_MESSAGE,
  type ProjectCardView,
} from '@/lib/projects/intelligence-view';
import type {
  ProjectIntelligenceSourceStatus,
  ProjectsIntelligenceData,
} from '@/types/projects-intelligence';

import styles from './ProjectsIntelligenceDashboard.module.scss';

const NOTICE_TONE: Partial<Record<ProjectIntelligenceSourceStatus, 'info' | 'warning'>> = {
  'not-configured': 'info',
  empty: 'info',
  'auth-error': 'warning',
  'permission-error': 'warning',
  'missing-data-source': 'warning',
  'missing-property': 'warning',
  'rate-limited': 'warning',
  'network-error': 'warning',
  'read-error': 'warning',
};

function Milestones({ project }: { project: ProjectCardView }) {
  if (project.milestones.length === 0) return null;

  return (
    <div className={styles.milestones}>
      <p className={styles['milestones-note']}>{MILESTONE_WEIGHT_NOTE}</p>
      <ul className={styles['milestone-list']}>
        {project.milestones.map((milestone) => (
          <li
            key={milestone.id}
            className={styles.milestone}
            data-completed={milestone.completed ? 'yes' : 'no'}
          >
            <div className={styles['milestone-top']}>
              <span className={styles['milestone-name']}>{milestone.name}</span>
              <Badge domain={milestone.completed ? 'projects' : 'neutral'} variant="outline">
                {milestone.statusLabel}
              </Badge>
            </div>
            <div className={styles['milestone-meta']}>
              {milestone.weight !== null ? (
                <span className="tabular">{milestone.weight} pts</span>
              ) : null}
              {milestone.completedAtLabel ? (
                <span>Completado {milestone.completedAtLabel}</span>
              ) : null}
            </div>
            {milestone.completionCriteria ? (
              <p className={styles['milestone-criteria']}>{milestone.completionCriteria}</p>
            ) : null}
            {milestone.evidence ? (
              <p className={styles['milestone-evidence']}>Evidencia: {milestone.evidence}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgressBlock({ project }: { project: ProjectCardView }) {
  const { progress } = project;

  if (!progress.measurable) {
    return (
      <div className={styles.progress} data-measurable="no">
        <span className={styles['progress-label']}>{PROGRESS_UNMEASURABLE_LABEL}</span>
        <p className={styles['progress-reason']}>{progress.reasonLabel}</p>
      </div>
    );
  }

  return (
    <div className={styles.progress} data-measurable="yes">
      <div className={styles['progress-top']}>
        <span className={styles['progress-label']}>{PROGRESS_VERIFIED_LABEL}</span>
        <strong className={`${styles['progress-percent']} tabular`}>{progress.percentLabel}</strong>
      </div>
      <ProgressBar
        value={progress.completedWeight ?? 0}
        max={progress.totalWeight ?? 100}
        domain="projects"
        label={`Progreso verificado por hitos: ${progress.percentLabel}`}
      />
      <p className={styles['progress-detail']}>
        {progress.completedWeight} de {progress.totalWeight} puntos de hitos completados
      </p>
    </div>
  );
}

function PiSnapshot({ project }: { project: ProjectCardView }) {
  const { pi } = project;

  if (!pi.hasSnapshot) {
    return <p className={styles['pi-empty']}>{PI_NO_SNAPSHOT_LABEL}</p>;
  }

  return (
    <div className={styles['pi-snapshot']}>
      {pi.recommendation ? (
        <Badge domain="projects" variant="soft">
          {pi.recommendation}
        </Badge>
      ) : null}
      {pi.confidence !== null ? (
        <span className={styles['pi-confidence']}>
          Confianza: <span className="tabular">{pi.confidence}</span>
        </span>
      ) : null}
      {pi.reviewedAtLabel ? (
        <span className={styles['pi-date']}>Revisado {pi.reviewedAtLabel}</span>
      ) : null}
      {pi.summary ? <p className={styles['pi-summary']}>{pi.summary}</p> : null}
      {pi.stale ? <p className={styles['pi-stale']}>{PI_STALE_LABEL}</p> : null}
    </div>
  );
}

function ProjectCard({
  project,
  emphasis = false,
}: {
  project: ProjectCardView;
  emphasis?: boolean;
}) {
  return (
    <article className={styles.card} data-emphasis={emphasis ? 'yes' : 'no'}>
      <header className={styles['card-top']}>
        <h3 className={styles['card-title']}>{project.name}</h3>
        <div className={styles['card-badges']}>
          <Badge domain="projects" variant="outline">
            {project.status}
          </Badge>
          {project.type ? (
            <Badge domain="neutral" variant="outline">
              {project.type}
            </Badge>
          ) : null}
        </div>
      </header>

      <ProgressBlock project={project} />

      <div
        className={styles['next-action']}
        data-warning={project.quality.missingNextAction ? 'yes' : 'no'}
      >
        <span className={styles['next-action-label']}>Próxima acción</span>
        <p className={styles['next-action-value']}>{project.nextAction.label}</p>
        {project.quality.multipleNextActionCandidates ? (
          <p className={styles['next-action-warning']}>{MULTIPLE_NEXT_ACTION_WARNING}</p>
        ) : null}
      </div>

      {project.blocker ? (
        <p className={styles.blocker}>
          <CircleAlert size={13} aria-hidden="true" />
          <span>{project.blocker}</span>
        </p>
      ) : null}

      <div className={styles.meta}>
        {project.lastAdvanceLabel ? <span>Último avance: {project.lastAdvanceLabel}</span> : null}
        {project.dueDateLabel ? <span>Límite: {project.dueDateLabel}</span> : null}
        {project.reviewDateLabel ? <span>Revisión: {project.reviewDateLabel}</span> : null}
      </div>

      <Milestones project={project} />

      <div className={styles['pi-block']}>
        <p className={styles['pi-title']}>Última lectura de Projects Intelligence</p>
        <PiSnapshot project={project} />
      </div>
    </article>
  );
}

function WaitingCard({ project }: { project: ProjectCardView }) {
  return (
    <article className={styles['compact-card']}>
      <div className={styles['card-top']}>
        <h3 className={styles['card-title']}>{project.name}</h3>
        {project.type ? (
          <Badge domain="neutral" variant="outline">
            {project.type}
          </Badge>
        ) : null}
      </div>
      {project.definitionOfDone ? <p className={styles.body}>{project.definitionOfDone}</p> : null}
      <ProgressBlock project={project} />
      <p className={styles['next-action-value']}>{project.nextAction.label}</p>
      {project.pi.recommendation ? (
        <Badge domain="projects" variant="soft">
          {project.pi.recommendation}
        </Badge>
      ) : null}
      {project.reviewDateLabel ? (
        <p className={styles.meta}>Revisión: {project.reviewDateLabel}</p>
      ) : null}
    </article>
  );
}

function BlockedCard({ project }: { project: ProjectCardView }) {
  return (
    <article className={styles['compact-card']}>
      <div className={styles['card-top']}>
        <h3 className={styles['card-title']}>{project.name}</h3>
      </div>
      {project.blocker ? <p className={styles.blocker}>{project.blocker}</p> : null}
      <p className={styles['next-action-value']}>{project.nextAction.label}</p>
      <ProgressBlock project={project} />
    </article>
  );
}

function AvoidCard({ project }: { project: ProjectCardView }) {
  return (
    <article className={styles['compact-card']}>
      <div className={styles['card-top']}>
        <h3 className={styles['card-title']}>{project.name}</h3>
        <Badge domain="neutral" variant="soft">
          {project.pi.recommendation}
        </Badge>
      </div>
      {project.pi.summary ? <p className={styles.body}>{project.pi.summary}</p> : null}
    </article>
  );
}

function HistoryRow({ project }: { project: ProjectCardView }) {
  return (
    <li className={styles['history-row']}>
      <span className={styles['history-name']}>{project.name}</span>
      <Badge domain="neutral" variant="outline">
        {project.status}
      </Badge>
      {project.progress.measurable ? (
        <span className="tabular">{project.progress.percentLabel}</span>
      ) : null}
      {project.lastAdvanceLabel ? <span>{project.lastAdvanceLabel}</span> : null}
    </li>
  );
}

export function ProjectsIntelligenceDashboard({ data }: { data: ProjectsIntelligenceData }) {
  const view = buildProjectsIntelligenceView(data);

  if (!view.ready) {
    const tone = NOTICE_TONE[view.status] ?? 'warning';
    const Icon = tone === 'warning' ? CircleAlert : Info;
    return (
      <Card aria-labelledby="projects-unavailable-title">
        <SectionHeader
          id="projects-unavailable-title"
          title="Proyectos"
          description={FAIL_CLOSED_REASSURANCE}
          domain="projects"
        />
        {view.unavailableMessage ? (
          <div className={styles.notice} data-tone={tone} role="status">
            <Icon size={15} strokeWidth={2} aria-hidden="true" />
            <span>{view.unavailableMessage}</span>
          </div>
        ) : null}
      </Card>
    );
  }

  if (view.isEmpty) {
    return (
      <Card aria-labelledby="projects-empty-title">
        <SectionHeader
          id="projects-empty-title"
          title="Proyectos"
          description="No hay proyectos en las bases canónicas para este momento."
          domain="projects"
        />
        {view.unavailableMessage ? (
          <div className={styles.notice} data-tone="info" role="status">
            <Info size={15} strokeWidth={2} aria-hidden="true" />
            <span>{view.unavailableMessage}</span>
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <p className={styles['meta-line']}>
        <span>Fuente: {view.source === 'notion' ? 'Notion' : 'Simulada'}</span>
        <span>
          Sync: {new Date(view.syncedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
        </span>
        <span>Fecha objetivo: {view.targetDate}</span>
      </p>

      <Card aria-labelledby="projects-summary-title">
        <SectionHeader
          id="projects-summary-title"
          title="Resumen"
          description="Datos reales del portfolio, sin recalcular contadores en la UI."
          domain="projects"
        />
        <ul className={styles['summary-grid']}>
          <li>
            <strong className="tabular">{view.summary.active}</strong>
            <span>Activos</span>
          </li>
          <li>
            <strong className="tabular">{view.summary.waiting}</strong>
            <span>En espera</span>
          </li>
          <li>
            <strong className="tabular">{view.summary.blocked}</strong>
            <span>Bloqueados</span>
          </li>
          <li>
            <strong className="tabular">{view.summary.progressMeasurable}</strong>
            <span>Progreso medible</span>
          </li>
          <li>
            <strong className="tabular">{view.summary.withoutNextAction}</strong>
            <span>Sin próxima acción</span>
          </li>
          <li>
            <strong className="tabular">{view.summary.completed}</strong>
            <span>Completados</span>
          </li>
        </ul>
      </Card>

      <Card aria-labelledby="projects-focus-title">
        <SectionHeader
          id="projects-focus-title"
          title="En foco"
          description="Proyectos activos, todos con la misma jerarquía cuando hay varios."
          domain="projects"
        />
        {view.focus.length === 0 ? (
          <p className={styles.empty}>Ningún proyecto activo en este momento.</p>
        ) : (
          <div
            className={styles['focus-grid']}
            data-single={view.focus.length === 1 ? 'yes' : 'no'}
          >
            {view.focus.map((project) => (
              <ProjectCard key={project.id} project={project} emphasis={view.focus.length === 1} />
            ))}
          </div>
        )}
      </Card>

      {view.avoidForNow.length > 0 ? (
        <Card aria-labelledby="projects-avoid-title">
          <SectionHeader
            id="projects-avoid-title"
            title="Evitar por ahora"
            description="Recomendación PI persistida en Notion: Esperar o Cancelar propuesto."
            domain="neutral"
          />
          <div className={styles['compact-grid']}>
            {view.avoidForNow.map((project) => (
              <AvoidCard key={project.id} project={project} />
            ))}
          </div>
        </Card>
      ) : null}

      {view.waiting.length > 0 ? (
        <Card aria-labelledby="projects-waiting-title">
          <SectionHeader
            id="projects-waiting-title"
            title="En espera"
            description="Proyectos pausados. Contexto secundario frente a En foco."
            domain="neutral"
          />
          <div className={styles['compact-grid']}>
            {view.waiting.map((project) => (
              <WaitingCard key={project.id} project={project} />
            ))}
          </div>
        </Card>
      ) : null}

      {view.blocked.length > 0 ? (
        <Card aria-labelledby="projects-blocked-title">
          <SectionHeader
            id="projects-blocked-title"
            title="Bloqueados"
            description="Proyectos con estado Bloqueado o bloqueo declarado."
            domain="neutral"
          />
          <div className={styles['compact-grid']}>
            {view.blocked.map((project) => (
              <BlockedCard key={project.id} project={project} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card aria-labelledby="projects-quality-title">
        <SectionHeader
          id="projects-quality-title"
          title="Calidad del portfolio"
          description="Señales de calidad de datos explícitas. No hay un puntaje único."
          domain="neutral"
        />
        {view.qualityAllClear ? (
          <p className={styles.empty}>{QUALITY_ALL_CLEAR_MESSAGE}</p>
        ) : (
          <ul className={styles['quality-grid']}>
            {view.qualityRows.map((row) => (
              <li key={row.key} data-zero={row.count === 0 ? 'yes' : 'no'}>
                <strong className="tabular">{row.count}</strong>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {view.history.length > 0 ? (
        <details className={styles.history}>
          <summary>
            <span>Historial · {view.history.length} proyectos</span>
          </summary>
          <ul className={styles['history-list']}>
            {view.history.map((project) => (
              <HistoryRow key={project.id} project={project} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
