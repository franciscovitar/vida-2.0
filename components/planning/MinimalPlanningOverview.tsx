import {
  DailyAttentionPanel,
  DailyRealityReviewPanel,
  DailyUpcomingPanel,
} from '@/components/planning/DailyOrientationPanels';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';

import styles from './MinimalPlanningOverview.module.scss';

function generatedAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Cordoba',
  }).format(date);
}

/** Read-only display of one ChatGPT-generated snapshot, never a local planner. */
export function MinimalPlanningOverview({ orientation }: { orientation: DailyOrientationView }) {
  const generated = orientation.generatedAt;
  return (
    <div className={styles.overview}>
      <p className={styles.freshness} role="status">
        {generated ? (
          <>
            <strong>Último análisis guardado</strong>
            <time dateTime={generated}>{generatedAtLabel(generated)}</time>
            <span>Las prioridades y fechas reflejan la información disponible en ese momento.</span>
          </>
        ) : (
          <>
            <strong>Todavía no hay un análisis guardado.</strong>
            <span>
              Hacé la revisión en el proyecto ChatGPT de Planificación; Vida mostrará el resultado
              cuando esté guardado y verificado.
            </span>
          </>
        )}
      </p>
      <div className={styles.panels}>
        <DailyRealityReviewPanel orientation={orientation} />
        <DailyAttentionPanel orientation={orientation} />
        <DailyUpcomingPanel orientation={orientation} />
      </div>
    </div>
  );
}
