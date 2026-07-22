'use client';

import type { NavItemData } from '@/lib/constants/navigation';

import { NavLink } from './NavLink';
import styles from './NavSections.module.scss';

interface NavSectionsProps {
  primary: readonly NavItemData[];
  secondary: readonly NavItemData[];
  /** Se llama al hacer clic en un enlace (por ejemplo, para cerrar el drawer). */
  onNavigate?: () => void;
}

export function NavSections({ primary, secondary, onNavigate }: NavSectionsProps) {
  return (
    <nav className={styles.nav} aria-label="Navegación principal">
      <ul className={styles.list}>
        {primary.map((item) => (
          <li key={item.href}>
            <NavLink item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>

      <div className={styles.divider} role="presentation" />

      <p className={styles.heading}>Personal</p>
      <ul className={styles.list}>
        {secondary.map((item) => (
          <li key={item.href}>
            <NavLink item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
