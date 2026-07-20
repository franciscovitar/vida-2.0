import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { domainVars } from '@/lib/constants/domains';
import type { Domain } from '@/types';

import styles from './SectionHeader.module.scss';

interface SectionHeaderProps {
  title: string;
  id?: string;
  description?: string;
  icon?: LucideIcon;
  domain?: Domain;
  /** Contenido alineado a la derecha (acciones, enlaces). */
  action?: ReactNode;
}

export function SectionHeader({
  title,
  id,
  description,
  icon: Icon,
  domain = 'neutral',
  action,
}: SectionHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.main}>
        {Icon ? (
          <span className={styles.icon} style={domainVars(domain)} aria-hidden="true">
            <Icon size={16} strokeWidth={2} />
          </span>
        ) : null}
        <div className={styles.text}>
          <h2 id={id} className={styles.title}>
            {title}
          </h2>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </header>
  );
}
