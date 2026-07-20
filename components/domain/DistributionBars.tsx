import { domainVars } from '@/lib/constants/domains';
import type { Domain } from '@/types';

import styles from './DistributionBars.module.scss';

export function DistributionBars({
  items,
  max,
}: {
  items: { id: string; label: string; valueLabel: string; fill: number; domain: Domain }[];
  max: number;
}) {
  return (
    <ul className={styles.list} aria-label="Distribución de tiempo">
      {items.map((item) => {
        const width = max > 0 ? Math.round((item.fill / max) * 100) : 0;
        return (
          <li key={item.id} className={styles.item} style={domainVars(item.domain)}>
            <div className={styles.meta}>
              <span className={styles.label}>{item.label}</span>
              <span className={`${styles.value} tabular`}>{item.valueLabel}</span>
            </div>
            <div
              className={styles.track}
              role="img"
              aria-label={`${item.label}: ${item.valueLabel}`}
            >
              <span className={styles.fill} style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
