import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './EmptyState.module.scss';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Acción opcional (botón o enlace). */
  action?: ReactNode;
  /** Lista breve de lo que mostrará la sección cuando tenga datos. */
  preview?: string[];
}

export function EmptyState({ icon: Icon, title, description, action, preview }: EmptyStateProps) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.icon} aria-hidden="true">
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {preview && preview.length > 0 ? (
        <ul className={styles.preview}>
          {preview.map((item) => (
            <li key={item} className={styles['preview-item']}>
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
