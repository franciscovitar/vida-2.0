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

  if (!writesEnabled) return <WritesDisabledNotice />;

  return (
    <Card>
      <SectionHeader
        title="Crear tarea"
        description="Requiere confirmación explícita."
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
          start(async () => {
            const result = await runWriteAction({
              actionType: 'task.create',
              payload: {
                title,
                priority,
                areaKey,
                projectKey: null,
                date: null,
                duration: null,
                energy: null,
                note: null,
              },
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (result.ok) {
              setTitle('');
              setConfirm(false);
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
          Confirmo crear esta tarea en Notion
        </label>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Guardando…' : 'Crear tarea'}
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

  if (!writesEnabled) return null;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirm) {
          setMessage('Confirmá el cambio.');
          return;
        }
        start(async () => {
          const result = await runWriteAction({
            actionType: 'task.change-status',
            payload: { taskKey, nextStatus },
            expectedPrevious: currentStatus,
            confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
          });
          setMessage(result.message);
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
        Confirmar cambio de estado
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        Cambiar estado
      </Button>
      {message ? <p className={styles.message}>{message}</p> : null}
    </form>
  );
}
