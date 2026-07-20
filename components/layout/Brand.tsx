import Link from 'next/link';

import styles from './Brand.module.scss';

export function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="Vida 2.0, ir a Hoy">
      <span className={styles.mark} aria-hidden="true">
        V
      </span>
      <span className={styles.text}>
        <span className={styles.name}>Vida 2.0</span>
        <span className={styles.tag}>Sistema personal</span>
      </span>
    </Link>
  );
}
