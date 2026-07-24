'use client';

import { ClipboardCheck, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import type {
  NotionArea,
  NotionProject,
  NotionTask,
  NotionTaskDuration,
  NotionTaskEnergy,
  NotionTaskPriority,
  NotionTaskStatus,
} from '@/types/notion';

import styles from './TaskPlanningWorkspace.module.scss';

const TASK_STATUSES: readonly NotionTaskStatus[] = [
  'Pendiente',
  'En progreso',
  'Bloqueada',
  'Hecha',
  'Algún día',
];

const TASK_PRIORITIES: readonly NotionTaskPriority[] = ['Alta', 'Media', 'Baja'];
const TASK_DURATIONS: readonly NotionTaskDuration[] = ['5-15 min', '30 min', '1 h', '2 h+'];
const TASK_ENERGIES: readonly NotionTaskEnergy[] = ['Baja', 'Media', 'Alta'];

interface LocalTaskDraft {
  key: string;
  title: string;
  priority: NotionTaskPriority;
  areaName: string;
  projectName: string | null;
  date: string | null;
  duration: NotionTaskDuration | null;
  energy: NotionTaskEnergy | null;
  note: string | null;
}

interface LocalStatusReview {
  key: string;
  taskTitle: string;
  currentStatus: NotionTaskStatus;
  nextStatus: NotionTaskStatus;
  reason: string | null;
}

interface TaskWorkspaceBackup {
  drafts: LocalTaskDraft[];
  statusReviews: LocalStatusReview[];
}

function isTaskDraft(value: unknown): value is LocalTaskDraft {
  return (
    isRecord(value) &&
    isString(value.key, 120) &&
    isString(value.title, 200) &&
    isOneOf(value.priority, TASK_PRIORITIES) &&
    isString(value.areaName, 200) &&
    isNullableString(value.projectName, 200) &&
    isNullableString(value.date, 10) &&
    (value.duration === null || isOneOf(value.duration, TASK_DURATIONS)) &&
    (value.energy === null || isOneOf(value.energy, TASK_ENERGIES)) &&
    isNullableString(value.note, 1_000)
  );
}

function isStatusReview(value: unknown): value is LocalStatusReview {
  return (
    isRecord(value) &&
    isString(value.key, 120) &&
    isString(value.taskTitle, 200) &&
    isOneOf(value.currentStatus, TASK_STATUSES) &&
    isOneOf(value.nextStatus, TASK_STATUSES) &&
    isNullableString(value.reason, 1_000)
  );
}

function isTaskWorkspaceBackup(value: unknown): value is TaskWorkspaceBackup {
  return (
    isRecord(value) &&
    isArrayOf(value.drafts, 100, isTaskDraft) &&
    isArrayOf(value.statusReviews, 100, isStatusReview)
  );
}

function suggestedNextStatus(status: NotionTaskStatus): NotionTaskStatus {
  if (status === 'Pendiente') return 'En progreso';
  if (status === 'En progreso' || status === 'Bloqueada') return 'Hecha';
  if (status === 'Hecha' || status === 'Algún día') return 'Pendiente';
  return 'Pendiente';
}

export function TaskPlanningWorkspace({
  tasks,
  projects,
  areas,
  targetDate,
}: {
  tasks: readonly NotionTask[];
  projects: readonly NotionProject[];
  areas: readonly NotionArea[];
  targetDate: string;
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<NotionTaskPriority>('Media');
  const [areaId, setAreaId] = useState(areas[0]?.id ?? '');
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(targetDate);
  const [duration, setDuration] = useState<NotionTaskDuration | ''>('');
  const [energy, setEnergy] = useState<NotionTaskEnergy | ''>('');
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<LocalTaskDraft[]>([]);

  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id ?? '');
  const [nextStatus, setNextStatus] = useState<NotionTaskStatus>(
    suggestedNextStatus(tasks[0]?.status ?? 'Pendiente'),
  );
  const [reviewReason, setReviewReason] = useState('');
  const [statusReviews, setStatusReviews] = useState<LocalStatusReview[]>([]);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const backupValue = useMemo<TaskWorkspaceBackup>(
    () => ({ drafts, statusReviews }),
    [drafts, statusReviews],
  );
  const localDraft = useLocalDraftBackup({
    key: LOCAL_DRAFT_KEYS.tasks,
    value: backupValue,
    validate: isTaskWorkspaceBackup,
    hasContent: (value) => value.drafts.length > 0 || value.statusReviews.length > 0,
    onRestore: (value) => {
      setDrafts(value.drafts);
      setStatusReviews(value.statusReviews);
      setTaskMessage('Plan local recuperado de este navegador.');
    },
    onClear: () => {
      setDrafts([]);
      setStatusReviews([]);
      setTaskMessage('Copia local eliminada.');
    },
  });
  const hasLocalPlan = drafts.length > 0 || statusReviews.length > 0;

  const selectedArea = useMemo(
    () => areas.find((area) => area.id === areaId) ?? null,
    [areas, areaId],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  );
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const availableProjects = useMemo(
    () =>
      projects.filter(
        (project) => !areaId || !project.area?.available || project.area.id === areaId,
      ),
    [projects, areaId],
  );

  const projectAreaMismatch = Boolean(
    selectedProject?.area?.available && areaId && selectedProject.area.id !== areaId,
  );

  function resetTaskForm() {
    setTitle('');
    setPriority('Media');
    setAreaId(areas[0]?.id ?? '');
    setProjectId('');
    setDate(targetDate);
    setDuration('');
    setEnergy('');
    setNote('');
    setTaskMessage(null);
  }

  return (
    <div className={styles.workspace}>
      <Card>
        <SectionHeader
          title="Preparar una tarea"
          description="Armá un borrador completo usando las áreas y proyectos ya cargados."
          domain="tasks"
        />
        <p className={styles['safety-notice']}>
          No se escribió ningún dato externo. Los borradores se guardan solo en este navegador y no
          se sincronizan con Notion.
        </p>
        <LocalDraftStatus
          controller={localDraft}
          hasContent={hasLocalPlan}
          label="plan de tareas"
        />
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            const cleanTitle = title.trim();
            if (!cleanTitle) {
              setTaskMessage('Escribí un título para preparar la tarea.');
              return;
            }
            if (!selectedArea) {
              setTaskMessage('Elegí un área válida.');
              return;
            }
            if (projectAreaMismatch) {
              setTaskMessage('El proyecto elegido pertenece a otra área.');
              return;
            }

            setDrafts((current) => [
              {
                key: crypto.randomUUID(),
                title: cleanTitle,
                priority,
                areaName: selectedArea.name,
                projectName: selectedProject?.name ?? null,
                date: date || null,
                duration: duration || null,
                energy: energy || null,
                note: note.trim() || null,
              },
              ...current,
            ]);
            setTaskMessage('Borrador agregado al plan local.');
            setTitle('');
            setProjectId('');
            setNote('');
          }}
        >
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Título</span>
              <input
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="Próxima acción concreta"
                required
              />
            </label>
            <label className={styles.field}>
              <span>Prioridad</span>
              <select
                className={styles.input}
                value={priority}
                onChange={(event) => setPriority(event.target.value as NotionTaskPriority)}
              >
                {(['Alta', 'Media', 'Baja'] as const).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Área</span>
              <select
                className={styles.input}
                value={areaId}
                onChange={(event) => {
                  const value = event.target.value;
                  setAreaId(value);
                  const project = projects.find((item) => item.id === projectId);
                  if (project?.area?.available && project.area.id !== value) setProjectId('');
                }}
                required
              >
                {areas.length === 0 ? <option value="">Sin áreas disponibles</option> : null}
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Proyecto opcional</span>
              <select
                className={styles.input}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Sin proyecto</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Fecha</span>
              <input
                className={styles.input}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Duración</span>
              <select
                className={styles.input}
                value={duration}
                onChange={(event) => setDuration(event.target.value as NotionTaskDuration | '')}
              >
                <option value="">Sin estimación</option>
                {TASK_DURATIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Energía</span>
              <select
                className={styles.input}
                value={energy}
                onChange={(event) => setEnergy(event.target.value as NotionTaskEnergy | '')}
              >
                <option value="">Sin estimación</option>
                {TASK_ENERGIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span>Nota</span>
            <textarea
              className={styles.textarea}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Contexto útil, definición de terminado o restricción"
            />
          </label>
          <div className={styles.preview}>
            <strong>{title.trim() || 'Nueva tarea'}</strong>
            <span>{selectedArea?.name ?? 'Sin área'}</span>
            <span>{selectedProject?.name ?? 'Sin proyecto'}</span>
            <span>{date || 'Sin fecha'}</span>
          </div>
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="primary"
              iconLeft={Plus}
              className={styles['touch-button']}
              disabled={areas.length === 0}
            >
              Agregar al plan local
            </Button>
            <Button
              type="button"
              iconLeft={RotateCcw}
              className={styles['touch-button']}
              onClick={resetTaskForm}
            >
              Limpiar
            </Button>
          </div>
          {taskMessage ? (
            <p className={styles.message} aria-live="polite">
              {taskMessage}
            </p>
          ) : null}
        </form>
      </Card>

      <Card>
        <SectionHeader
          title="Revisar estado de una tarea"
          description="Prepará una transición con el estado actual visible, sin ejecutarla."
          domain="tasks"
        />
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedTask) {
              setStatusMessage('No hay una tarea seleccionada.');
              return;
            }
            if (selectedTask.status === nextStatus) {
              setStatusMessage('Elegí un estado diferente al actual.');
              return;
            }
            setStatusReviews((current) => [
              {
                key: crypto.randomUUID(),
                taskTitle: selectedTask.title,
                currentStatus: selectedTask.status,
                nextStatus,
                reason: reviewReason.trim() || null,
              },
              ...current,
            ]);
            setReviewReason('');
            setStatusMessage('Cambio agregado a la revisión local.');
          }}
        >
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Tarea</span>
              <select
                className={styles.input}
                value={selectedTaskId}
                onChange={(event) => {
                  const value = event.target.value;
                  const task = tasks.find((item) => item.id === value);
                  setSelectedTaskId(value);
                  setNextStatus(suggestedNextStatus(task?.status ?? 'Pendiente'));
                }}
                disabled={tasks.length === 0}
              >
                {tasks.length === 0 ? <option value="">Sin tareas disponibles</option> : null}
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles['current-state']}>
              <span>Estado actual</span>
              <Badge domain="tasks" variant="outline">
                {selectedTask?.status ?? '—'}
              </Badge>
            </div>
            <label className={styles.field}>
              <span>Estado propuesto</span>
              <select
                className={styles.input}
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as NotionTaskStatus)}
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span>Motivo o evidencia</span>
            <textarea
              className={styles.textarea}
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
              rows={3}
              placeholder="Qué cambió para justificar la transición"
            />
          </label>
          <Button
            type="submit"
            iconLeft={ClipboardCheck}
            className={styles['touch-button']}
            disabled={!selectedTask}
          >
            Preparar cambio
          </Button>
          {statusMessage ? (
            <p className={styles.message} aria-live="polite">
              {statusMessage}
            </p>
          ) : null}
        </form>
      </Card>

      <Card>
        <SectionHeader
          title="Plan local de esta sesión"
          description={`${drafts.length} tareas nuevas · ${statusReviews.length} cambios de estado`}
          domain="tasks"
        />
        {drafts.length === 0 && statusReviews.length === 0 ? (
          <p className={styles.empty}>Todavía no preparaste cambios.</p>
        ) : (
          <div className={styles.queue}>
            {drafts.map((draft) => (
              <article key={draft.key} className={styles['queue-item']}>
                <div className={styles['queue-top']}>
                  <div>
                    <Badge domain="tasks" variant="soft">
                      Nueva tarea
                    </Badge>
                    <strong>{draft.title}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconLeft={Trash2}
                    className={styles['touch-button']}
                    onClick={() =>
                      setDrafts((current) => current.filter((item) => item.key !== draft.key))
                    }
                  >
                    Quitar
                  </Button>
                </div>
                <p className={styles.meta}>
                  {draft.priority} · {draft.areaName} · {draft.projectName ?? 'Sin proyecto'} ·{' '}
                  {draft.date ?? 'Sin fecha'}
                </p>
                {draft.duration || draft.energy ? (
                  <p className={styles.meta}>
                    {draft.duration ?? 'Sin duración'} · energía {draft.energy ?? 'sin estimar'}
                  </p>
                ) : null}
                {draft.note ? <p className={styles.body}>{draft.note}</p> : null}
              </article>
            ))}
            {statusReviews.map((review) => (
              <article key={review.key} className={styles['queue-item']}>
                <div className={styles['queue-top']}>
                  <div>
                    <Badge domain="neutral" variant="outline">
                      Revisión de estado
                    </Badge>
                    <strong>{review.taskTitle}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconLeft={Trash2}
                    className={styles['touch-button']}
                    onClick={() =>
                      setStatusReviews((current) =>
                        current.filter((item) => item.key !== review.key),
                      )
                    }
                  >
                    Quitar
                  </Button>
                </div>
                <p className={styles.meta}>
                  {review.currentStatus} → {review.nextStatus}
                </p>
                {review.reason ? <p className={styles.body}>{review.reason}</p> : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
