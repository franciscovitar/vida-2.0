'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { PERIOD_OPTIONS, type PeriodDays } from '@/lib/periods';

import styles from './PeriodSelector.module.scss';

export function PeriodSelector({ value }: { value: PeriodDays }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onSelect = (days: PeriodDays) => {
    if (days === value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', String(days));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div
      className={styles.root}
      role="group"
      aria-label="Período de análisis"
      data-pending={pending || undefined}
    >
      {PERIOD_OPTIONS.map((days) => (
        <button
          key={days}
          type="button"
          className={styles.option}
          aria-pressed={days === value}
          onClick={() => onSelect(days)}
        >
          {days}d
        </button>
      ))}
    </div>
  );
}
