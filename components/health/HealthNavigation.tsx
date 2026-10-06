import Link from 'next/link';

import styles from './HealthNavigation.module.scss';

export type HealthSection = 'summary' | 'sleep' | 'heart' | 'activity';

const ITEMS: Array<{ id: HealthSection; label: string; href: string }> = [
  { id: 'summary', label: 'Resumen', href: '/salud' },
  { id: 'sleep', label: 'Sueño', href: '/salud/sueno' },
  { id: 'heart', label: 'Corazón', href: '/salud/corazon' },
  { id: 'activity', label: 'Actividad', href: '/salud/actividad' },
];

export function HealthNavigation({ current }: { current: HealthSection }) {
  return (
    <nav className={styles.navigation} aria-label="Secciones de Salud">
      {ITEMS.map((item) => (
        <Link
          aria-current={current === item.id ? 'page' : undefined}
          className={styles.link}
          href={item.href}
          key={item.id}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
