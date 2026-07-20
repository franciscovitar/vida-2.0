import type { ElementType, ReactNode } from 'react';

import styles from './Card.module.scss';

interface CardProps {
  children: ReactNode;
  /** Etiqueta HTML a renderizar (por defecto section). */
  as?: ElementType;
  /** Reduce el relleno interno para contenedores densos. */
  compact?: boolean;
  className?: string;
  'aria-labelledby'?: string;
}

export function Card({
  children,
  as: Tag = 'section',
  compact = false,
  className,
  ...rest
}: CardProps) {
  const classes = [styles.card, compact ? styles.compact : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
