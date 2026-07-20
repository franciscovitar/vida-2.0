import type { ReactNode } from 'react';

import { domainVars } from '@/lib/constants/domains';
import type { Domain } from '@/types';

import styles from './Badge.module.scss';

interface BadgeProps {
  children: ReactNode;
  domain?: Domain;
  /** Estilo relleno suave (por defecto) o solo contorno. */
  variant?: 'soft' | 'outline' | 'dot';
}

export function Badge({ children, domain = 'neutral', variant = 'soft' }: BadgeProps) {
  return (
    <span className={styles.badge} data-variant={variant} style={domainVars(domain)}>
      {variant === 'dot' ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
