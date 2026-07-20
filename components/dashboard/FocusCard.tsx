import { Target } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { dailyFocus } from '@/lib/mock-data';

import styles from './FocusCard.module.scss';

export function FocusCard() {
  return (
    <Card compact aria-labelledby="focus-title">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Target size={16} strokeWidth={2} />
        </span>
        <h2 id="focus-title" className={styles.heading}>
          Foco principal
        </h2>
      </div>
      <p className={styles.primary}>{dailyFocus.primary}</p>
      {dailyFocus.secondary.length > 0 ? (
        <ul className={styles.secondary}>
          {dailyFocus.secondary.map((item) => (
            <li key={item} className={styles.item}>
              <span className={styles.dot} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
