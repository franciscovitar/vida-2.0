import { domainVars } from '@/lib/constants/domains';
import type { Domain } from '@/types';

import styles from './ProgressBar.module.scss';

interface ProgressBarProps {
  value: number;
  max?: number;
  domain?: Domain;
  /** Etiqueta accesible describiendo el progreso. */
  label: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max = 100,
  domain = 'neutral',
  label,
  size = 'md',
}: ProgressBarProps) {
  const safeMax = max <= 0 ? 1 : max;
  const percent = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));

  return (
    <div
      className={styles.track}
      data-size={size}
      style={domainVars(domain)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
