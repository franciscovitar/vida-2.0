import type { ReactNode } from 'react';

import styles from './AppShell.module.scss';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export async function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#contenido" className={styles.skip}>
        Saltar al contenido
      </a>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <main id="contenido" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
