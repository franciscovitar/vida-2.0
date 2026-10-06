import Link from 'next/link';

import styles from './NutritionNavigation.module.scss';

export type NutritionSection = 'today' | 'trends' | 'nutrients' | 'plan';

const ITEMS: Array<{ id: NutritionSection; label: string; href: string }> = [
  { id: 'today', label: 'Hoy', href: '/dieta' },
  { id: 'trends', label: 'Tendencias', href: '/dieta/tendencias' },
  { id: 'nutrients', label: 'Nutrientes', href: '/dieta/nutrientes' },
  { id: 'plan', label: 'Plan', href: '/dieta/plan' },
];

export function NutritionNavigation({ current }: { current: NutritionSection }) {
  return (
    <nav className={styles.navigation} aria-label="Secciones de Nutrición">
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
