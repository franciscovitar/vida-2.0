'use client';

import { useMemo, useState, useTransition } from 'react';

import { runWriteAction } from '@/app/actions/writes';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type {
  TaskWriteAreaOption,
  TaskWriteProjectOption,
  TaskWriteTaskOption,
} from '@/lib/actions/task-write-catalog';
import type {
  CalendarHoldCreatePayload,
  TaskChangeStatusPayload,
  TaskCreatePayload,
} from '@/types/actions';

import styles from './WritePanels.module.scss';

const TASK_STATUSES: TaskChangeStatusPayload['nextStatus'][] = [
  'Pendiente',
  'En progreso',
  'Bloqueada',
  'Hecha',
  'Algún día',
];

export function WritesDisabledNotice() {
  return (
    <p className={styles.notice}>
      Esta sección permanece en modo solo lectura. El registro se habilitará en una etapa posterior.
    </p>
  );
}

function ActionBlockedNotice({ message }: { message: string }) {
  return <p className={styles.notice}>{message}</p>;
}

export function TaskCreatePanel({
  writesEnabled,
  areaOptions,
  projectOptions,
  actionReady = true,
}: {
  writesEnabled: boolean;
  areaOptions: readonly TaskWriteAreaOption[];
  projectOptions: readonly TaskWriteProjectOption[];
  actionReady?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'Alta' | 'Media' | 'Baja'>('Media');
  const [areaKey, setAreaKey] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const effectiveAreaKey = areaOptions.some((area) => area.key === areaKey)
    ? areaKey
    : (areaOptions[0]?.key ?? '');

  const projectsForArea = useMemo(
    () => projectOptions.filter((project) => project.areaKey === effectiveAreaKey),
    [projectOptions, effectiveAreaKey],
  );

  const effectiveProjectKey = projectsForArea.some((project) => project.key === projectKey)
    ? projectKey
    : '';

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader title="Crear tarea" description="Propuestas desactivadas." domain="tasks" />
        <WritesDisabledNotice />
      </Card>
    );
  }

  const canSubmit = actionReady && areaOptions.length > 0 && Boolean(effectiveAreaKey);

  return (
    <Card>
      <SectionHeader
        title="Crear tarea"
        description="Crea una propuesta (proposal.create). No escribe directo en Notion."
        domain="tasks"
      />
      {!actionReady ? (
        <ActionBlockedNotice message="Prerrequisitos de escritura incompletos. Revisá la matriz de operabilidad." />
      ) : null}
      {areaOptions.length === 0 ? (
        <ActionBlockedNotice message="No hay áreas autorizadas disponibles. Completá el catálogo DEV antes de crear tareas." />
      ) : null}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            setMessage(
              areaOptions.length === 0
                ? 'No hay áreas autorizadas disponibles. Completá el catálogo DEV antes de crear tareas.'
                : 'Prerrequisitos incompletos.',
            );
            return;
          }
          if (!confirm) {
            setMessage('Marcá la confirmación explícita.');
            return;
          }
          const preserved = {
            title,
            priority,
            areaKey: effectiveAreaKey,
            projectKey: effectiveProjectKey,
          };
          const businessPayload: TaskCreatePayload = {
            title: preserved.title,
            priority: preserved.priority,
            areaKey: preserved.areaKey,
            projectKey: preserved.projectKey || null,
            date: null,
            duration: null,
            energy: null,
            note: null,
          };
          start(async () => {
            const result = await runWriteAction({
              actionType: 'proposal.create',
              payload: {
                name: `Crear tarea: ${title.trim().slice(0, 80)}`,
                proposedActionType: 'task.create',
                targetType: 'task',
                targetKey: null,
                reason: 'Alta de tarea desde la web',
                expectedChange: `Nueva tarea “${title.trim()}” en estado Pendiente`,
                risk: 'medium',
                reversible: true,
                payload: businessPayload,
              },
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (result.ok) {
              setTitle('');
              setConfirm(false);
              setProjectKey('');
            } else {
              setTitle(preserved.title);
              setPriority(preserved.priority);
              setAreaKey(preserved.areaKey);
              setProjectKey(preserved.projectKey);
            }
          });
        }}
      >
        <label className={styles.label}>
          Título
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={!canSubmit}
          />
        </label>
        <label className={styles.label}>
          Prioridad
          <select
            className={styles.input}
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            disabled={!canSubmit}
          >
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </label>
        <label className={styles.label}>
          Área
          <select
            className={styles.input}
            value={effectiveAreaKey}
            onChange={(e) => {
              setAreaKey(e.target.value);
              setProjectKey('');
            }}
            required
            disabled={!canSubmit}
          >
            {areaOptions.map((area) => (
              <option key={area.key} value={area.key}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.label}>
          Proyecto (opcional)
          <select
            className={styles.input}
            value={effectiveProjectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            disabled={!canSubmit || projectsForArea.length === 0}
          >
            <option value="">Sin proyecto</option>
            {projectsForArea.map((project) => (
              <option key={project.key} value={project.key}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            disabled={!canSubmit}
          />
          Confirmo proponer esta tarea
        </label>
        <Button type="submit" variant="primary" disabled={pending || !canSubmit}>
          {pending ? 'Enviando…' : 'Crear propuesta'}
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}

export function TaskStatusPanel({
  writesEnabled,
  taskOptions,
  actionReady = true,
}: {
  writesEnabled: boolean;
  taskOptions: readonly TaskWriteTaskOption[];
  actionReady?: boolean;
}) {
  const [taskKey, setTaskKey] = useState('');
  const [nextStatus, setNextStatus] =
    useState<TaskChangeStatusPayload['nextStatus']>('En progreso');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const effectiveTaskKey = taskOptions.some((task) => task.key === taskKey)
    ? taskKey
    : (taskOptions[0]?.key ?? '');
  const selected = taskOptions.find((task) => task.key === effectiveTaskKey) ?? null;
  const currentStatus = selected?.status ?? null;
  const nextOptions = TASK_STATUSES.filter((status) => status !== currentStatus);
  const effectiveNextStatus = (nextOptions.includes(nextStatus) ? nextStatus : nextOptions[0]) as
    TaskChangeStatusPayload['nextStatus'] | undefined;

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader
          title="Cambiar estado"
          description="Propuestas desactivadas."
          domain="tasks"
        />
        <WritesDisabledNotice />
      </Card>
    );
  }

  const canSubmit =
    actionReady &&
    Boolean(selected) &&
    Boolean(currentStatus) &&
    Boolean(effectiveNextStatus) &&
    effectiveNextStatus !== currentStatus;

  return (
    <Card>
      <SectionHeader
        title="Cambiar estado"
        description="Propone un cambio de estado sobre una tarea real del catálogo."
        domain="tasks"
      />
      {!actionReady ? (
        <ActionBlockedNotice message="Prerrequisitos de escritura incompletos. Revisá la matriz de operabilidad." />
      ) : null}
      {taskOptions.length === 0 ? (
        <ActionBlockedNotice message="No hay tareas disponibles. Creá y aprobá una tarea primero." />
      ) : null}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit || !selected || !currentStatus || !effectiveNextStatus) {
            setMessage(
              taskOptions.length === 0
                ? 'No hay tareas disponibles. Creá y aprobá una tarea primero.'
                : 'Seleccioná una tarea y un estado distinto.',
            );
            return;
          }
          if (!confirm) {
            setMessage('Confirmá el cambio.');
            return;
          }
          const preserved = {
            taskKey: selected.key,
            currentStatus,
            nextStatus: effectiveNextStatus,
          };
          const businessPayload: TaskChangeStatusPayload = {
            taskKey: preserved.taskKey,
            nextStatus: preserved.nextStatus,
          };
          start(async () => {
            const result = await runWriteAction({
              actionType: 'proposal.create',
              payload: {
                name: `Cambiar estado: ${selected.title.slice(0, 40)}`,
                proposedActionType: 'task.change-status',
                targetType: 'task',
                targetKey: preserved.taskKey,
                reason: 'Cambio de estado desde la web',
                expectedChange: `${preserved.currentStatus} → ${preserved.nextStatus}`,
                risk: 'low',
                reversible: true,
                payload: businessPayload,
              },
              expectedPrevious: preserved.currentStatus,
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (!result.ok) {
              setTaskKey(preserved.taskKey);
              setNextStatus(preserved.nextStatus);
            }
          });
        }}
      >
        <label className={styles.label}>
          Tarea
          <select
            className={styles.input}
            value={effectiveTaskKey}
            onChange={(e) => setTaskKey(e.target.value)}
            required
            disabled={!actionReady || taskOptions.length === 0}
          >
            {taskOptions.map((task) => (
              <option key={task.key} value={task.key}>
                {task.title}
                {task.areaName ? ` · ${task.areaName}` : ''}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.message}>
          Estado actual: {currentStatus ?? '—'}
          {selected?.projectName ? ` · ${selected.projectName}` : ''}
        </p>
        <label className={styles.label}>
          Nuevo estado
          <select
            className={styles.input}
            value={effectiveNextStatus ?? ''}
            onChange={(e) => setNextStatus(e.target.value as TaskChangeStatusPayload['nextStatus'])}
            disabled={!actionReady || taskOptions.length === 0}
          >
            {nextOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            disabled={!canSubmit}
          />
          Confirmar propuesta de cambio de estado
        </label>
        <Button type="submit" size="sm" disabled={pending || !canSubmit}>
          Proponer cambio
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}

export function CalendarHoldPanel({
  writesEnabled,
  actionReady = true,
}: {
  writesEnabled: boolean;
  actionReady?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader title="Hold de calendario" description="Escrituras desactivadas." />
        <WritesDisabledNotice />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Hold de calendario"
        description="Propone un bloque privado en el calendario dedicado (sin invitados ni Meet)."
      />
      {!actionReady ? (
        <ActionBlockedNotice message="Calendario dedicado no operable. Revisá la matriz de operabilidad." />
      ) : null}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!actionReady) {
            setMessage('Calendario dedicado no operable.');
            return;
          }
          if (!confirm) {
            setMessage('Confirmá la propuesta.');
            return;
          }
          const startIso = start ? new Date(start).toISOString() : '';
          const endIso = end ? new Date(end).toISOString() : '';
          const preserved = { title, start, end, note };
          const businessPayload: CalendarHoldCreatePayload = {
            title: preserved.title.trim(),
            start: startIso,
            end: endIso,
            note: preserved.note.trim() || null,
            relatedTaskKey: null,
          };
          startTransition(async () => {
            const result = await runWriteAction({
              actionType: 'proposal.create',
              payload: {
                name: `Hold: ${preserved.title.trim().slice(0, 80)}`,
                proposedActionType: 'calendar.hold.create',
                targetType: 'calendar-hold',
                targetKey: null,
                reason: 'Reserva temporal desde la web',
                expectedChange: `Hold privado “${preserved.title.trim()}”`,
                risk: 'medium',
                reversible: true,
                payload: businessPayload,
              },
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (result.ok) {
              setTitle('');
              setStart('');
              setEnd('');
              setNote('');
              setConfirm(false);
            } else {
              setTitle(preserved.title);
              setStart(preserved.start);
              setEnd(preserved.end);
              setNote(preserved.note);
            }
          });
        }}
      >
        <label className={styles.label}>
          Título
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={!actionReady}
          />
        </label>
        <label className={styles.label}>
          Inicio
          <input
            className={styles.input}
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            disabled={!actionReady}
          />
        </label>
        <label className={styles.label}>
          Fin
          <input
            className={styles.input}
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
            disabled={!actionReady}
          />
        </label>
        <label className={styles.label}>
          Nota (opcional)
          <textarea
            className={styles.input}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!actionReady}
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            disabled={!actionReady}
          />
          Confirmo proponer este hold privado
        </label>
        <Button type="submit" variant="primary" disabled={pending || !actionReady}>
          {pending ? 'Enviando…' : 'Crear propuesta'}
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}
