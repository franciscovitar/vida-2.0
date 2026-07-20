import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { domainVars } from '@/lib/constants/domains';
import type { Domain } from '@/types';

import styles from './PageHeader.module.scss';

interface PageHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  domain?: Domain;
  action?: ReactNode;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  domain = 'neutral',
  action,
}: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.main}>
        <span className={styles.icon} style={domainVars(domain)} aria-hidden="true">
          <Icon size={20} strokeWidth={2} />
        </span>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </header>
  );
}
