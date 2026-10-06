import Link from 'next/link';

import type { NutritionWindow } from '@/lib/nutrition/window';

import styles from './NutritionRangeSelector.module.scss';

const WINDOWS: Array<{ id: NutritionWindow; label: string }> = [
  { id: '7d', label: '7D' },
  { id: '28d', label: '28D' },
  { id: '90d', label: '90D' },
];

export function NutritionRangeSelector({
  current,
  basePath,
}: {
  current: NutritionWindow;
  basePath: string;
}) {
  return (
    <nav className={styles.range} aria-label="Período">
      {WINDOWS.map((window) => (
        <Link
          aria-current={current === window.id ? 'page' : undefined}
          href={window.id === '28d' ? basePath : `${basePath}?range=${window.id}`}
          key={window.id}
        >
          {window.label}
        </Link>
      ))}
    </nav>
  );
}
