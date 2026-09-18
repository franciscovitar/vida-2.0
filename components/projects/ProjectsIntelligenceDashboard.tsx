/**
 * Projects Intelligence portfolio surface.
 *
 * The default view is intentionally compact. Canonical long-form project
 * definition and milestone evidence remain available through native
 * progressive disclosure instead of competing with the scan/decision layer.
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

function ProjectProgress({ project }: { project: ProjectCardView }) {
  const completedMilestones = project.milestones.filter((milestone) => milestone.completed).length;
  const totalMilestones = project.milestones.length;

  if (!project.progress.measurable) {
    return (
      <div className={styles['progress-compact']} data-measurable="no">
        <span>Progreso sin medir</span>
        <small>{project.progress.reasonLabel}</small>
      </div>
    );
  }

  return (
    <div className={styles['progress-compact']} data-measurable="yes">
      <div className={styles['progress-line']}>
        <strong className="tabular">{project.progress.percentLabel}</strong>
        <span>
          {totalMilestones > 0
            ? `${completedMilestones}/${totalMilestones} hitos`
            : `${project.progress.completedWeight}/${project.progress.totalWeight} pts`}
        </span>
      </div>
      <ProgressBar
        value={project.progress.completedWeight ?? 0}
        max={project.progress.totalWeight ?? 100}
        domain="projects"
        label={`Progreso verificado por hitos: ${project.progress.percentLabel}`}
        size="sm"
      />
    </div>
  );
}

function MilestoneBreakdown({ project }: { project: ProjectCardView }) {
  if (project.milestones.length === 0) {
    return <p className={styles['detail-empty']}>Sin hitos definidos.</p>;
  }

  return (
    <div className={styles['milestone-breakdown']}>
      <p className={styles['detail-note']}>{MILESTONE_WEIGHT_NOTE}</p>
      <ul className={styles['milestone-list']}>
        {project.milestones.map((milestone) => (
          <li key={milestone.id} data-completed={milestone.completed ? 'yes' : 'no'}>
            <div className={styles['milestone-row']}>
              <span className={styles['milestone-name']}>{milestone.name}</span>
              <span className={styles['milestone-state']}>
                {milestone.weight !== null ? (
                  <span className="tabular">{milestone.weight} pts</span>
                ) : null}
                <Badge domain={milestone.completed ? 'projects' : 'neutral'} variant="outline">
                  {milestone.statusLabel}
                </Badge>
              </span>
            </div>
            {milestone.completionCriteria ? (
              <p className={styles['milestone-criteria']}>{milestone.completionCriteria}</p>
            ) : null}
            {milestone.completedAtLabel ? (
              <p className={styles['milestone-date']}>Completado {milestone.completedAtLabel}</p>
            ) : null}
            {milestone.evidence ? (
              <details className={styles['evidence-details']}>
                <summary>Evidencia</summary>
                <p>{milestone.evidence}</p>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectDetails({ project }: { project: ProjectCardView }) {
  const hasDates =
    project.lastAdvanceLabel || project.dueDateLabel || project.reviewDateLabel || project.blocker;
  const hasPi =
    project.pi.hasSnapshot ||
    project.quality.multipleNextActionCandidates ||
    project.nextAction.kind !== 'resolved';

  return (
    <details className={styles['project-details']}>
      <summary>Ver más</summary>
      <div className={styles['details-content']}>
        {project.expectedResult ? (
          <section>
            <h4>Resultado</h4>
            <p>{project.expectedResult}</p>
          </section>
        ) : null}

        {project.definitionOfDone ? (
          <section>
            <h4>Definition of Done</h4>
            <p>{project.definitionOfDone}</p>
          </section>
        ) : null}

        {hasDates ? (
          <section>
            <h4>Estado operativo</h4>
            <div className={styles['detail-meta']}>
              {project.blocker ? <span>Bloqueo: {project.blocker}</span> : null}
              {project.lastAdvanceLabel ? <span>Último avance: {project.lastAdvanceLabel}</span> : null}
              {project.dueDateLabel ? <span>Límite: {project.dueDateLabel}</span> : null}
              {project.reviewDateLabel ? <span>Revisión: {project.reviewDateLabel}</span> : null}
            </div>
          </section>
        ) : null}

        <section>
          <h4>Hitos</h4>
          <MilestoneBreakdown project={project} />
        </section>

        {hasPi ? (
          <section>
            <h4>Datos adicionales</h4>
            <div className={styles['detail-meta']}>
              {project.nextAction.kind !== 'resolved' ? <span>{project.nextAction.label}</span> : null}
              {project.quality.multipleNextActionCandidates ? (
                <span>{MULTIPLE_NEXT_ACTION_WARNING}</span>
              ) : null}
              {project.pi.hasSnapshot ? (
                <>
                  {project.pi.recommendation ? <span>PI: {project.pi.recommendation}</span> : null}
                  {project.pi.confidence !== null ? (
                    <span>Confianza: {project.pi.confidence}</span>
                  ) : null}
                  {project.pi.reviewedAtLabel ? (
                    <span>Revisado: {project.pi.reviewedAtLabel}</span>
                  ) : null}
                  {project.pi.stale ? <span>{PI_STALE_LABEL}</span> : null}
                </>
              ) : (
                <span>{PI_NO_SNAPSHOT_LABEL}</span>
              )}
            </div>
            {project.pi.summary ? <p className={styles['pi-summary']}>{project.pi.summary}</p> : null}
          </section>
        ) : null}
      </div>
    </details>
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
    <article
      className={styles['project-card']}
      data-emphasis={emphasis ? 'yes' : 'no'}
      data-status={project.status}
    >
      <header className={styles['project-card-header']}>
        <h3>{project.name}</h3>
        <div className={styles.badges}>
          <Badge domain={project.status === 'Activo' ? 'projects' : 'neutral'} variant="outline">
            {project.status}
          </Badge>
          {project.type ? (
            <Badge domain="neutral" variant="outline">
              {project.type}
            </Badge>
          ) : null}
        </div>
      </header>

      {project.summary ? <p className={styles.summary}>{project.summary}</p> : null}

      <ProjectProgress project={project} />

      {project.nextAction.kind === 'resolved' ? (
        <p className={styles['next-action']}>
          <span>Ahora</span>
          {project.nextAction.label}
        </p>
      ) : null}

      {project.blocker ? (
        <p className={styles.blocker}>
          <CircleAlert size={14} aria-hidden="true" />
          <span>{project.blocker}</span>
        </p>
      ) : null}

      <ProjectDetails project={project} />
    </article>
  );
}

function SectionHeading({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className={styles['section-heading']}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {count !== undefined ? <span className={styles.count}>{count}</span> : null}
    </div>
  );
}

function CompletedRow({ project }: { project: ProjectCardView }) {
  return (
    <li className={styles['completed-row']}>
      <div>
        <strong>{project.name}</strong>
        {project.type ? <span>{project.type}</span> : null}
      </div>
      <div className={styles['completed-status']}>
        <span className="tabular">{project.progress.percentLabel ?? 'Completado'}</span>
        {project.lastAdvanceLabel ? <small>{project.lastAdvanceLabel}</small> : null}
      </div>
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
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <ul className={styles['summary-strip']} aria-label="Resumen del portfolio">
        <li>
          <strong className="tabular">{view.summary.active}</strong>
          <span>En foco</span>
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
          <strong className="tabular">{view.summary.completed}</strong>
          <span>Completados</span>
        </li>
      </ul>

      <section className={styles.section} aria-labelledby="projects-focus-title">
        <SectionHeading
          title="En foco"
          description="Solo lo que está activo ahora."
          count={view.focus.length}
        />
        {view.focus.length === 0 ? (
          <p className={styles.empty}>Ningún proyecto activo.</p>
        ) : (
          <div className={styles['project-grid']} data-density="focus">
            {view.focus.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                emphasis={view.focus.length === 1}
              />
            ))}
          </div>
        )}
      </section>

      {view.blocked.length > 0 ? (
        <section className={styles.section} aria-labelledby="projects-blocked-title">
          <SectionHeading
            title="Bloqueados"
            description="Necesitan resolver un bloqueo antes de seguir."
            count={view.blocked.length}
          />
          <div className={styles['project-grid']}>
            {view.blocked.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      ) : null}

      {view.waiting.length > 0 ? (
        <section className={styles.section} aria-labelledby="projects-waiting-title">
          <SectionHeading
            title="En espera"
            description="Preservados sin competir por tu atención diaria."
            count={view.waiting.length}
          />
          <div className={styles['project-grid']}>
            {view.waiting.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      ) : null}

      {view.history.length > 0 ? (
        <details className={styles['completed-section']}>
          <summary>
            <span>Completados e historial</span>
            <span className={styles.count}>{view.history.length}</span>
          </summary>
          <ul className={styles['completed-list']}>
            {view.history.map((project) => (
              <CompletedRow key={project.id} project={project} />
            ))}
          </ul>
        </details>
      ) : null}

      <details className={styles.diagnostics}>
        <summary>Datos y calidad</summary>
        <div className={styles['diagnostics-content']}>
          <p>
            Fuente: {view.source === 'notion' ? 'Notion' : 'Simulada'} · Sync:{' '}
            {new Date(view.syncedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · Fecha
            objetivo: {view.targetDate}
          </p>
          {view.qualityAllClear ? (
            <p>{QUALITY_ALL_CLEAR_MESSAGE}</p>
          ) : (
            <ul>
              {view.qualityRows
                .filter((row) => row.count > 0)
                .map((row) => (
                  <li key={row.key}>
                    <strong className="tabular">{row.count}</strong> {row.label}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
