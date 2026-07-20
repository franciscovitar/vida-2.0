'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { PROJECT_STATUSES } from '@/lib/notion/constants';
import { filterProjects, relationLabel, type ProjectFilterState } from '@/lib/notion/view-filters';
import type { NotionArea, NotionProject } from '@/types/notion';

import styles from './NotionBoards.module.scss';

export function ProjectsBoard({
  projects,
  areas,
}: {
  projects: NotionProject[];
  areas: NotionArea[];
}) {
  const [filters, setFilters] = useState<ProjectFilterState>({
    status: 'all',
    areaId: 'all',
    blocker: 'all',
    nextAction: 'all',
  });

  const visible = useMemo(() => filterProjects(projects, filters), [projects, filters]);

  return (
    <div className={styles.board}>
      <div className={styles.filters}>
        <label className={styles.field}>
          <span>Estado</span>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                status: event.target.value as ProjectFilterState['status'],
              }))
            }
          >
            <option value="all">Todos</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
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
          <span>Bloqueo</span>
          <select
            value={filters.blocker}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                blocker: event.target.value as ProjectFilterState['blocker'],
              }))
            }
          >
            <option value="all">Todos</option>
            <option value="with">Con bloqueo</option>
            <option value="without">Sin bloqueo</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Próxima acción</span>
          <select
            value={filters.nextAction}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                nextAction: event.target.value as ProjectFilterState['nextAction'],
              }))
            }
          >
            <option value="all">Todas</option>
            <option value="with">Con próxima acción</option>
            <option value="without">Sin próxima acción</option>
          </select>
        </label>
      </div>

      <p className={styles.count}>
        {visible.length} de {projects.length} proyectos
      </p>

      <ul className={styles.cards}>
        {visible.map((project) => (
          <li key={project.id} className={styles.card} data-kind={project.dateKind}>
            <div className={styles['card-top']}>
              <span className={styles.title}>{project.name}</span>
              <Badge domain={project.domain}>{project.status}</Badge>
            </div>
            <p className={styles.sub}>{relationLabel(project.area)}</p>
            {project.expectedResult ? (
              <p className={styles.body}>{project.expectedResult}</p>
            ) : null}
            <p className={styles.body}>
              Próxima acción:{' '}
              {project.nextAction && project.nextAction.trim() !== ''
                ? project.nextAction
                : 'Sin próxima acción'}
            </p>
            <div className={styles.meta}>
              <span>Límite: {project.dueDate ?? 'Sin fecha'}</span>
              <span>Revisión: {project.reviewDate ?? '—'}</span>
              <span>{project.relatedTaskCount} tareas</span>
            </div>
            {project.blocker ? <p className={styles.block}>Bloqueo: {project.blocker}</p> : null}
          </li>
        ))}
      </ul>
      {visible.length === 0 ? (
        <p className={styles.empty}>Ningún proyecto coincide con los filtros.</p>
      ) : null}
    </div>
  );
}
