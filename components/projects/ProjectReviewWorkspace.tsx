'use client';

import { ClipboardCheck, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { LocalDraftStatus } from '@/components/local-drafts/LocalDraftStatus';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  isArrayOf,
  isNullableString,
  isOneOf,
  isRecord,
  isString,
} from '@/lib/local-drafts/guards';
import { LOCAL_DRAFT_KEYS } from '@/lib/local-drafts/storage';
import { useLocalDraftBackup } from '@/lib/local-drafts/use-local-draft-backup';
import type { NotionArea, NotionProject } from '@/types/notion';

import styles from './ProjectReviewWorkspace.module.scss';

type ProjectDecision = 'continue' | 'wait' | 'block' | 'prepare-close' | 'review-later';

interface LocalProjectReview {
  key: string;
  projectName: string;
  currentStatus: NotionProject['status'];
  decision: ProjectDecision;
  nextAction: string | null;
  blocker: string | null;
  reviewDate: string | null;
  note: string | null;
}

const PROJECT_DECISIONS = ['continue', 'wait', 'block', 'prepare-close', 'review-later'] as const;

const DECISION_LABELS: Record<ProjectDecision, string> = {
  continue: 'Continuar',
  wait: 'Poner en espera',
  block: 'Marcar como bloqueado',
  'prepare-close': 'Preparar cierre',
  'review-later': 'Revisar más adelante',
};

function isProjectReview(value: unknown): value is LocalProjectReview {
  return (
    isRecord(value) &&
    isString(value.key, 120) &&
    isString(value.projectName, 240) &&
    isString(value.currentStatus, 80) &&
    isOneOf(value.decision, PROJECT_DECISIONS) &&
    isNullableString(value.nextAction, 500) &&
    isNullableString(value.blocker, 500) &&
    isNullableString(value.reviewDate, 10) &&
    isNullableString(value.note, 1_000)
  );
}

function isProjectReviewBackup(value: unknown): value is LocalProjectReview[] {
  return isArrayOf(value, 100, isProjectReview);
}

export function ProjectReviewWorkspace({
  projects,
  areas,
  targetDate,
}: {
  projects: readonly NotionProject[];
  areas: readonly NotionArea[];
  targetDate: string;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [decision, setDecision] = useState<ProjectDecision>('continue');
  const [nextAction, setNextAction] = useState(projects[0]?.nextAction ?? '');
  const [blocker, setBlocker] = useState(projects[0]?.blocker ?? '');
  const [reviewDate, setReviewDate] = useState(projects[0]?.reviewDate ?? targetDate);
  const [note, setNote] = useState('');
  const [reviews, setReviews] = useState<LocalProjectReview[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const localDraft = useLocalDraftBackup({
    key: LOCAL_DRAFT_KEYS.projects,
    value: reviews,
    validate: isProjectReviewBackup,
    hasContent: (value) => value.length > 0,
    onRestore: (value) => {
      setReviews(value);
      setMessage('Revisiones recuperadas de este navegador.');
    },
    onClear: () => {
      setReviews([]);
      setMessage('Copia local eliminada.');
    },
  });

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  );

  const areaName = useMemo(() => {
    if (!selectedProject?.area?.available) return 'Área no disponible';
    return (
      areas.find((area) => area.id === selectedProject.area?.id)?.name ??
      selectedProject.area.name ??
      'Área'
    );
  }, [areas, selectedProject]);

  function loadProject(project: NotionProject | null) {
    setNextAction(project?.nextAction ?? '');
    setBlocker(project?.blocker ?? '');
    setReviewDate(project?.reviewDate ?? targetDate);
    setDecision(project?.status === 'Bloqueado' ? 'block' : 'continue');
    setNote('');
    setMessage(null);
  }

  return (
    <div className={styles.workspace}>
      <Card>
        <SectionHeader
          title="Revisión operativa de proyectos"
          description="Tomá una decisión local usando estado, bloqueo y próxima acción reales."
          domain="projects"
        />
        <p className={styles['safety-notice']}>
          No se escribió ningún dato externo. Esta revisión prepara decisiones; no cambia Notion ni
          crea tareas.
        </p>
        <LocalDraftStatus
          controller={localDraft}
          hasContent={reviews.length > 0}
          label="revisión de proyectos"
        />

        {projects.length === 0 ? (
          <p className={styles.empty}>No hay proyectos disponibles para revisar.</p>
        ) : (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedProject) {
                setMessage('Elegí un proyecto válido.');
                return;
              }
              if (decision === 'continue' && !nextAction.trim()) {
                setMessage('Definí una próxima acción concreta para continuar.');
                return;
              }
              if (decision === 'block' && !blocker.trim()) {
                setMessage('Indicá el bloqueo antes de preparar esa decisión.');
                return;
              }

              setReviews((current) => [
                {
                  key: crypto.randomUUID(),
                  projectName: selectedProject.name,
                  currentStatus: selectedProject.status,
                  decision,
                  nextAction: nextAction.trim() || null,
                  blocker: blocker.trim() || null,
                  reviewDate: reviewDate || null,
                  note: note.trim() || null,
                },
                ...current,
              ]);
              setMessage('Revisión agregada al plan local.');
              setNote('');
            }}
          >
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Proyecto</span>
                <select
                  className={styles.input}
                  value={projectId}
                  onChange={(event) => {
                    const value = event.target.value;
                    const project = projects.find((item) => item.id === value) ?? null;
                    setProjectId(value);
                    loadProject(project);
                  }}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Decisión</span>
                <select
                  className={styles.input}
                  value={decision}
                  onChange={(event) => setDecision(event.target.value as ProjectDecision)}
                >
                  {Object.entries(DECISION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Próxima revisión</span>
                <input
                  className={styles.input}
                  type="date"
                  value={reviewDate}
                  onChange={(event) => setReviewDate(event.target.value)}
                />
              </label>
            </div>

            <div className={styles['project-facts']}>
              <div>
                <span>Estado actual</span>
                <Badge domain="projects" variant="outline">
                  {selectedProject?.status ?? '—'}
                </Badge>
              </div>
              <div>
                <span>Área</span>
                <strong>{areaName}</strong>
              </div>
              <div>
                <span>Tareas relacionadas</span>
                <strong>{selectedProject?.relatedTaskCount ?? 0}</strong>
              </div>
              <div>
                <span>Fecha límite</span>
                <strong>{selectedProject?.dueDate ?? 'Sin fecha'}</strong>
              </div>
            </div>

            <label className={styles.field}>
              <span>Próxima acción</span>
              <textarea
                className={styles.textarea}
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Acción física y verificable que mueve el proyecto"
              />
            </label>
            <label className={styles.field}>
              <span>Bloqueo</span>
              <textarea
                className={styles.textarea}
                value={blocker}
                onChange={(event) => setBlocker(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Dependencia, espera o impedimento concreto"
              />
            </label>
            <label className={styles.field}>
              <span>Nota de revisión</span>
              <textarea
                className={styles.textarea}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Evidencia, criterio o contexto para la próxima revisión"
              />
            </label>

            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                iconLeft={ClipboardCheck}
                className={styles['touch-button']}
              >
                Agregar revisión local
              </Button>
              <Button
                type="button"
                iconLeft={RotateCcw}
                className={styles['touch-button']}
                onClick={() => loadProject(selectedProject)}
              >
                Restaurar datos
              </Button>
            </div>
            {message ? (
              <p className={styles.message} aria-live="polite">
                {message}
              </p>
            ) : null}
          </form>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Revisiones preparadas"
          description={`${reviews.length} decisiones locales en esta sesión`}
          domain="projects"
        />
        {reviews.length === 0 ? (
          <p className={styles.empty}>Todavía no preparaste revisiones.</p>
        ) : (
          <div className={styles.queue}>
            {reviews.map((review) => (
              <article key={review.key} className={styles['queue-item']}>
                <div className={styles['queue-top']}>
                  <div>
                    <Badge domain="projects" variant="soft">
                      {DECISION_LABELS[review.decision]}
                    </Badge>
                    <strong>{review.projectName}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconLeft={Trash2}
                    className={styles['touch-button']}
                    onClick={() =>
                      setReviews((current) => current.filter((item) => item.key !== review.key))
                    }
                  >
                    Quitar
                  </Button>
                </div>
                <p className={styles.meta}>
                  Estado actual: {review.currentStatus} · revisión{' '}
                  {review.reviewDate ?? 'sin fecha'}
                </p>
                {review.nextAction ? (
                  <p className={styles.body}>Próxima acción: {review.nextAction}</p>
                ) : null}
                {review.blocker ? <p className={styles.body}>Bloqueo: {review.blocker}</p> : null}
                {review.note ? <p className={styles.meta}>{review.note}</p> : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
