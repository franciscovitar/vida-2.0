import {
  DailyAttentionPanel,
  DailyRealityReviewPanel,
  DailyUpcomingPanel,
} from '@/components/planning/DailyOrientationPanels';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';

import styles from './PlanningWorkspace.module.scss';

/** Read-only display of one ChatGPT-generated snapshot, never a local planner. */
export function MinimalPlanningOverview({ orientation }: { orientation: DailyOrientationView }) {
  const generated = orientation.generatedAt;
  return (
    <div className={styles.stack}>
      <p className={styles['week-source-note']} role="status">
        {generated
          ? `Último análisis guardado: ${generated.slice(0, 16).replace('T', ' ')}. Las prioridades y fechas reflejan lo conocido al generarlo; no son consultas en vivo.`
          : 'Todavía no hay un análisis V2 guardado. Hacé tu revisión en el proyecto ChatGPT de Planificación; Vida solo mostrará lo que haya sido persistido y verificado.'}
      </p>
      <DailyRealityReviewPanel orientation={orientation} />
      <DailyAttentionPanel orientation={orientation} />
      <DailyUpcomingPanel orientation={orientation} />
    </div>
  );
}
