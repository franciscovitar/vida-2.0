import { NavSections } from '@/components/navigation/NavSections';
import { getTodayData } from '@/lib/data/source';
import { integrationSidebarLabel } from '@/lib/data/integration-label';

import { Brand } from './Brand';
import styles from './Sidebar.module.scss';

export async function Sidebar() {
  const today = await getTodayData();
  const label = integrationSidebarLabel(today.source, today.status);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.head}>
        <Brand />
      </div>
      <div className={styles.body}>
        <NavSections />
      </div>
      <div className={styles.foot}>
        <p className={styles.note}>{label}</p>
      </div>
    </aside>
  );
}
