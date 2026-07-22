import { NavSections } from '@/components/navigation/NavSections';
import { getTodayData } from '@/lib/data/source';
import { integrationSidebarLabel } from '@/lib/data/integration-label';
import { getAppNavigation } from '@/lib/web-catalog/service';

import { Brand } from './Brand';
import styles from './Sidebar.module.scss';

export async function Sidebar() {
  const [today, nav] = await Promise.all([getTodayData(), getAppNavigation()]);
  const label = integrationSidebarLabel(today.source, today.status);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.head}>
        <Brand />
      </div>
      <div className={styles.body}>
        <NavSections primary={nav.primary} secondary={nav.secondary} />
      </div>
      <div className={styles.foot}>
        <p className={styles.note}>{label}</p>
      </div>
    </aside>
  );
}
