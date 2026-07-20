import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

import styles from './page.module.scss';

/** Estado de carga de la vista Hoy (mientras se leen los datos). */
export default function Loading() {
  return (
    <div className={styles.page} aria-busy="true">
      <div>
        <Skeleton width="8rem" height="2rem" radius="0.5rem" />
        <div style={{ marginTop: '0.75rem' }}>
          <Skeleton width="18rem" height="1rem" radius="0.375rem" />
        </div>
      </div>

      <div className={styles.top}>
        <Card>
          <Skeleton height="6rem" radius="0.5rem" />
        </Card>
        <Card>
          <Skeleton height="6rem" radius="0.5rem" />
        </Card>
      </div>

      <div className={styles.columns}>
        <div className={styles.main}>
          <Card>
            <Skeleton height="10rem" radius="0.5rem" />
          </Card>
          <Card>
            <Skeleton height="10rem" radius="0.5rem" />
          </Card>
        </div>
        <div className={styles.side}>
          <Card>
            <Skeleton height="8rem" radius="0.5rem" />
          </Card>
          <Card>
            <Skeleton height="8rem" radius="0.5rem" />
          </Card>
        </div>
      </div>
    </div>
  );
}
