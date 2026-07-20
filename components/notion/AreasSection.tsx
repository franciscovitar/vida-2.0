import { Badge } from '@/components/ui/Badge';
import type { NotionArea } from '@/types/notion';

import styles from './NotionBoards.module.scss';

/** Sección reutilizable de áreas (filtros, etiquetas, agrupación). */
export function AreasSection({ areas }: { areas: NotionArea[] }) {
  return (
    <ul className={styles.areas}>
      {areas.map((area) => (
        <li key={area.id} className={styles.area}>
          <div className={styles['card-top']}>
            <span className={styles.title}>{area.name}</span>
            <Badge domain={area.domain} variant="outline">
              {area.status}
            </Badge>
          </div>
          {area.purpose ? <p className={styles.body}>{area.purpose}</p> : null}
          <div className={styles.meta}>
            <span>{area.relatedProjectCount} proyectos</span>
            <span>{area.relatedTaskCount} tareas</span>
            <span>Revisión: {area.reviewDate ?? '—'}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
