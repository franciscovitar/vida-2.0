'use client';

import { useState, useTransition } from 'react';

import { runWriteAction } from '@/app/actions/writes';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

import styles from './WritePanels.module.scss';

export function WritesDisabledNotice() {
  return (
    <p className={styles.notice}>
      Esta sección permanece en modo solo lectura. El registro se habilitará en una etapa posterior.
    </p>
  );
}

export function TaskCreatePanel({ writesEnabled }: { writesEnabled: boolean }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'Alta' | 'Media' | 'Baja'>('Media');
  const [areaKey, setAreaKey] = useState('area.salud');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader title="Crear tarea" description="Propuestas desactivadas." domain="tasks" />
        <WritesDisabledNotice />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Crear tarea"
        description="Crea una propuesta (proposal.create). No escribe directo en Notion."
        domain="tasks"
      />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirm) {
            setMessage('Marcá la confirmación explícita.');
            return;
          }
          const preserved = { title, priority, areaKey };
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
                payload: {
                  title: preserved.title,
                  priority: preserved.priority,
                  areaKey: preserved.areaKey,
                  projectKey: null,
                  date: null,
                  duration: null,
                  energy: null,
                  note: null,
                },
              },
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (result.ok) {
              setTitle('');
              setConfirm(false);
            } else {
              setTitle(preserved.title);
              setPriority(preserved.priority);
              setAreaKey(preserved.areaKey);
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
          />
        </label>
        <label className={styles.label}>
          Prioridad
          <select
            className={styles.input}
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </label>
        <label className={styles.label}>
          Área (clave)
          <input
            className={styles.input}
            value={areaKey}
            onChange={(e) => setAreaKey(e.target.value)}
          />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          Confirmo proponer esta tarea
        </label>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Enviando…' : 'Crear propuesta'}
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}

export function TaskStatusPanel({ writesEnabled }: { writesEnabled: boolean }) {
  const [taskKey, setTaskKey] = useState('');
  const [currentStatus, setCurrentStatus] = useState('Pendiente');
  const [nextStatus, setNextStatus] = useState('En progreso');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

  return (
    <Card>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirm) {
            setMessage('Confirmá el cambio.');
            return;
          }
          const preserved = { taskKey, currentStatus, nextStatus };
          start(async () => {
            const result = await runWriteAction({
              actionType: 'proposal.create',
              payload: {
                name: `Cambiar estado: ${preserved.taskKey.slice(0, 40)}`,
                proposedActionType: 'task.change-status',
                targetType: 'task',
                targetKey: preserved.taskKey,
                reason: 'Cambio de estado desde la web',
                expectedChange: `${preserved.currentStatus} → ${preserved.nextStatus}`,
                risk: 'low',
                reversible: true,
                payload: { taskKey: preserved.taskKey, nextStatus: preserved.nextStatus },
              },
              expectedPrevious: preserved.currentStatus,
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (!result.ok) {
              setTaskKey(preserved.taskKey);
              setCurrentStatus(preserved.currentStatus);
              setNextStatus(preserved.nextStatus);
            }
          });
        }}
      >
        <label className={styles.label}>
          Clave de tarea
          <input
            className={styles.input}
            value={taskKey}
            onChange={(e) => setTaskKey(e.target.value)}
            required
          />
        </label>
        <label className={styles.label}>
          Estado actual esperado
          <select
            className={styles.input}
            value={currentStatus}
            onChange={(e) => setCurrentStatus(e.target.value)}
          >
            {['Pendiente', 'En progreso', 'Bloqueada', 'Hecha', 'Algún día'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.label}>
          Nuevo estado
          <select
            className={styles.input}
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
          >
            {['Pendiente', 'En progreso', 'Bloqueada', 'Hecha', 'Algún día'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          Confirmar propuesta de cambio de estado
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          Proponer cambio
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}

export function CalendarHoldPanel({ writesEnabled }: { writesEnabled: boolean }) {
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
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirm) {
            setMessage('Confirmá la propuesta.');
            return;
          }
          const startIso = start ? new Date(start).toISOString() : '';
          const endIso = end ? new Date(end).toISOString() : '';
          const preserved = { title, start, end, note };
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
                payload: {
                  title: preserved.title.trim(),
                  start: startIso,
                  end: endIso,
                  note: preserved.note.trim() || null,
                  relatedTaskKey: null,
                },
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
          />
        </label>
        <label className={styles.label}>
          Nota (opcional)
          <textarea
            className={styles.input}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          Confirmo proponer este hold privado
        </label>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Enviando…' : 'Crear propuesta'}
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}
