import type { ReactNode } from 'react';

import styles from './household.module.scss';

export default function HouseholdLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>Vida 2.0</span>
          <span className={styles.context}>Hogar</span>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
