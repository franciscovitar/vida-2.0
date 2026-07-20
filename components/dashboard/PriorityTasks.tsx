'use client';

import { CheckSquare } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { tasks } from '@/lib/mock-data';
import type { Domain, Task, TaskPriority } from '@/types';

import styles from './PriorityTasks.module.scss';

/** Fecha de referencia como string (evita pasar un Date al límite RSC → cliente). */
const REFERENCE_DAY = '2026-07-20';

const priorityMeta: Record<TaskPriority, { label: string; domain: Domain }> = {
  high: { label: 'Alta', domain: 'danger' },
  medium: { label: 'Media', domain: 'projects' },
  low: { label: 'Baja', domain: 'neutral' },
};

const priorityWeight: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

function dueLabel(dueDate: string | undefined, todayYmd: string): string {
  if (!dueDate) return 'Sin fecha';
  const due = new Date(`${dueDate}T12:00:00`);
  const base = new Date(`${todayYmd}T12:00:00`);
  const diffDays = Math.round((due.getTime() - base.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  return due.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function PriorityTasks() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  const visible = useMemo<Task[]>(
    () =>
      [...tasks]
        .sort((a, b) => {
          if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
            return priorityWeight[a.priority] - priorityWeight[b.priority];
          }
          return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
        })
        .slice(0, 4),
    [],
  );

  return (
    <Card aria-labelledby="tasks-title">
      <SectionHeader
        id="tasks-title"
        title="Tareas prioritarias"
        description="Lo más importante para hoy."
        icon={CheckSquare}
        domain="tasks"
      />
      <ul className={styles.list}>
        {visible.map((task) => {
          const isDone = done[task.id] ?? false;
          const meta = priorityMeta[task.priority];
          return (
            <li key={task.id} className={styles.item} data-done={isDone}>
              <Checkbox
                checked={isDone}
                onChange={(next) => setDone((prev) => ({ ...prev, [task.id]: next }))}
                label={`Marcar "${task.title}" como completada`}
              />
              <div className={styles.body}>
                <p className={styles.title}>{task.title}</p>
                <div className={styles.meta}>
                  {task.projectName ? (
                    <span className={styles.project}>{task.projectName}</span>
                  ) : null}
                  <span className={styles.area}>{task.area}</span>
                  <span className={`${styles.due} tabular`}>
                    {dueLabel(task.dueDate, REFERENCE_DAY)}
                  </span>
                </div>
              </div>
              <Badge domain={meta.domain} variant="soft">
                {meta.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
