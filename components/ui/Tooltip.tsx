import type { ReactNode } from 'react';

import styles from './Tooltip.module.scss';

interface TooltipProps {
  /** Texto del tooltip. */
  label: string;
  children: ReactNode;
}

/**
 * Tooltip simple, sin JavaScript: se muestra al hacer hover o al enfocar el
 * contenido con el teclado. El texto se asocia mediante aria para lectores de
 * pantalla.
 */
export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      {children}
      <span role="tooltip" className={styles.bubble}>
        {label}
      </span>
    </span>
  );
}
