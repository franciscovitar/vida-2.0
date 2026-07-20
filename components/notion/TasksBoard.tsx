'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { filterTasks, relationLabel, type TaskFilterState } from '@/lib/notion/view-filters';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/notion/constants';
import type { NotionArea, NotionProject, NotionTask } from '@/types/notion';

import styles from './NotionBoards.module.scss';

function formatDate(date: string | null, kind: NotionTask['dateKind']): string {
  if (!date) return 'Sin fecha';
  if (kind === 'today') return `${date} · hoy`;
  if (kind === 'overdue') return `${date} · vencida`;
  return date;
}

export function TasksBoard({
  tasks,
  projects,
  areas,
}: {
  tasks: NotionTask[];
  projects: NotionProject[];
  areas: NotionArea[];
}) {
  const [filters, setFilters] = useState<TaskFilterState>({
    query: '',
    status: 'all',
    priority: 'all',
    areaId: 'all',
    projectId: 'all',
  });

  const visible = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);

  return (
    <div className={styles.board}>
      <div className={styles.filters} role="search">
        <label className={styles.field}>
          <span>Buscar</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => setFilters((f) => ({ ...f, query: event.target.value }))}
            placeholder="Título"
          />
        </label>
        <label className={styles.field}>
          <span>Estado</span>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                status: event.target.value as TaskFilterState['status'],
              }))
            }
          >
            <option value="all">Todos</option>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Prioridad</span>
          <select
            value={filters.priority}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                priority: event.target.value as TaskFilterState['priority'],
              }))
            }
          >
            <option value="all">Todas</option>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Área</span>
          <select
            value={filters.areaId}
            onChange={(event) => setFilters((f) => ({ ...f, areaId: event.target.value }))}
          >
            <option value="all">Todas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Proyecto</span>
          <select
            value={filters.projectId}
            onChange={(event) => setFilters((f) => ({ ...f, projectId: event.target.value }))}
          >
            <option value="all">Todos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className={styles.count}>
        {visible.length} de {tasks.length} tareas
      </p>

      <ul className={styles.list}>
        {visible.map((task) => (
          <li key={task.id} className={styles.item} data-kind={task.dateKind}>
            <div className={styles.main}>
              <span className={styles.title}>{task.title}</span>
              <div className={styles.meta}>
                <Badge domain={task.domain} variant="soft">
                  {task.status}
                </Badge>
                {task.priority ? (
                  <Badge domain="tasks" variant="outline">
                    {task.priority}
                  </Badge>
                ) : null}
                {task.duration ? <span>{task.duration}</span> : null}
                {task.energy ? <span>Energía {task.energy}</span> : null}
              </div>
            </div>
            <div className={styles.side}>
              <span className={styles.date}>{formatDate(task.date, task.dateKind)}</span>
              <span className={styles.sub}>{relationLabel(task.area)}</span>
              <span className={styles.sub}>{relationLabel(task.project)}</span>
              {task.blocker ? <span className={styles.block}>Bloqueo: {task.blocker}</span> : null}
            </div>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? (
        <p className={styles.empty}>Ninguna tarea coincide con los filtros.</p>
      ) : null}
    </div>
  );
}
