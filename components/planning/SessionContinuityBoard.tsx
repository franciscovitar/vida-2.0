import { BookOpenCheck, FolderKanban } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type {
  ContinuityItem,
  ContinuitySource,
  ContinuityView,
} from '@/lib/session-continuity/view';

import styles from './SessionContinuityBoard.module.scss';

const STATE_LABEL: Record<ContinuityItem['state'], string> = {
  ready: 'Paso registrado',
  stale: 'Revisar vigencia',
  degraded: 'Fuente parcial',
  conflict: 'Datos contradictorios',
  unavailable: 'Paso sin verificar',
};

function ContinuityList({
  items,
  source,
  unavailable,
}: {
  items: readonly ContinuityItem[];
  source: ContinuitySource;
  unavailable: boolean;
}) {
  if (unavailable) {
    return (
      <p role="status" className={styles.notice}>
        {source === 'projects-os'
          ? 'No se pudo verificar la información de Notion. No se muestran tareas supuestas.'
          : 'No se pudo verificar Assessment Progress. No se muestran actividades supuestas.'}
      </p>
    );
  }

  if (items.length === 0) {
    return <p className={styles.notice}>No hay próximos pasos disponibles en esta fuente.</p>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <div className={styles.header}>
            <h3>{item.title}</h3>
            <span className={styles.tag} data-state={item.state}>
              {STATE_LABEL[item.state]}
            </span>
          </div>
          {item.nextAction && item.state !== 'conflict' && item.state !== 'unavailable' ? (
            <p className={styles.action}>
              <span>Próximo paso:</span> {item.nextAction}
            </p>
          ) : (
            <p className={styles.muted}>Todavía no hay un próximo paso verificable.</p>
          )}
          {item.blocker ? <p className={styles.muted}>Pendiente: {item.blocker}</p> : null}
          <p className={styles.provenance}>
            {item.sourceLabel}
            {item.asOf ? (
              <>
                {' '}
                ·{' '}
                <time dateTime={item.asOf}>
                  {source === 'projects-os' ? 'Último avance declarado: ' : 'Snapshot: '}
                  {item.asOf.slice(0, 10)}
                </time>
              </>
            ) : (
              ' · Sin fecha de avance verificable'
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** No automatic project closeout is performed by this read-only page. */
export function SessionContinuityBoard({ view }: { view: ContinuityView }) {
  return (
    <div className={styles.layout}>
      <p className={styles.intro}>
        Tus próximos pasos según las fuentes que ya usan tus Projects. No crea tareas, no modifica
        progreso y no reemplaza el cierre en ChatGPT. Una fecha reciente de lectura no garantiza que
        la próxima acción esté actualizada.
      </p>
      <Card>
        <SectionHeader
          title="Proyectos"
          icon={FolderKanban}
          domain="projects"
          description="Próxima acción de Notion Proyectos, verificada contra la tarea vinculada."
        />
        <ContinuityList
          items={view.projects}
          source="projects-os"
          unavailable={view.projectSource === 'unavailable'}
        />
      </Card>
      <Card>
        <SectionHeader
          title="Facultad"
          icon={BookOpenCheck}
          domain="learning"
          description="Próxima actividad académica del último snapshot válido por evaluación."
        />
        {view.academicSource === 'degraded' ? (
          <p role="status" className={styles.notice}>
            Algunas filas académicas no pasaron la validación. Los pasos visibles son parciales.
          </p>
        ) : null}
        <ContinuityList
          items={view.academic}
          source="university"
          unavailable={view.academicSource === 'unavailable'}
        />
      </Card>
    </div>
  );
}
