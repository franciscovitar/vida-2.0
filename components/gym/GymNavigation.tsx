import Link from 'next/link';

import styles from './GymNavigation.module.scss';

export type GymSection = 'summary' | 'routine' | 'progress' | 'cardio';

const ITEMS: Array<{ id: GymSection; label: string; href: string }> = [
  { id: 'summary', label: 'Resumen', href: '/gimnasio' },
  { id: 'routine', label: 'Rutina', href: '/gimnasio/rutina' },
  { id: 'progress', label: 'Progreso', href: '/gimnasio/progreso' },
  { id: 'cardio', label: 'Cardio', href: '/gimnasio/cardio' },
];

export function GymNavigation({ current }: { current: GymSection }) {
  return (
    <nav className={styles.navigation} aria-label="Secciones de Gimnasio">
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
