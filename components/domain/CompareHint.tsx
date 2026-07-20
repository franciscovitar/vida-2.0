import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import type { PeriodCompare } from '@/lib/adapters/compare';

import styles from './CompareHint.module.scss';

export function CompareHint({
  compare,
  prefix = 'vs. anterior',
}: {
  compare: PeriodCompare;
  prefix?: string;
}) {
  if (!compare.available && compare.direction === 'none') {
    return <span className={styles.hint}>{compare.label}</span>;
  }
  const Icon =
    compare.direction === 'up'
      ? ArrowUpRight
      : compare.direction === 'down'
        ? ArrowDownRight
        : Minus;
  return (
    <span className={styles.hint} data-dir={compare.direction}>
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      <span>
        {compare.label}
        <span className={styles.prefix}> {prefix}</span>
      </span>
    </span>
  );
}
