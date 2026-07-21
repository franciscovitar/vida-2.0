import type { ReactNode } from 'react';

import styles from './public.module.scss';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>;
}
