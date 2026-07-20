import { Plus, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { DayHeaderView } from '@/types';

import styles from './DayHeader.module.scss';

export function DayHeader({ header }: { header: DayHeaderView }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <div className={styles['title-row']}>
          <h1 className={styles.title}>Hoy</h1>
          <span className={styles.sync} data-ok={header.syncOk}>
            <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
            {header.syncLabel}
          </span>
        </div>
        <p className={styles.date}>{header.fullDate}</p>
        <p className={styles.greeting}>{header.greeting}, este es tu resumen del día.</p>
      </div>
      <div className={styles.actions}>
        <Button href="/bandeja" variant="primary" iconLeft={Plus}>
          Captura rápida
        </Button>
      </div>
    </header>
  );
}
