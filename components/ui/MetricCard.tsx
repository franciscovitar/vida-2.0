import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { domainVars } from '@/lib/constants/domains';
import type { Domain, MetricStatus, Trend } from '@/types';

import styles from './MetricCard.module.scss';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  /** Texto de contexto: comparación, objetivo, etc. */
  context?: string;
  status?: MetricStatus;
  trend?: Trend;
  icon?: LucideIcon;
  domain?: Domain;
}

const trendIcon: Record<Trend, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  steady: Minus,
};

export function MetricCard({
  label,
  value,
  unit,
  context,
  status = 'neutral',
  trend,
  icon: Icon,
  domain = 'neutral',
}: MetricCardProps) {
  const TrendIcon = trend ? trendIcon[trend] : null;

  return (
    <div className={styles.card} style={domainVars(domain)}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {Icon ? (
          <span className={styles.icon} aria-hidden="true">
            <Icon size={15} strokeWidth={2} />
          </span>
        ) : null}
      </div>
      <p className={`${styles.value} tabular`}>
        {value}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </p>
      {context ? (
        <p className={styles.context} data-status={status}>
          {TrendIcon ? <TrendIcon size={13} strokeWidth={2.5} aria-hidden="true" /> : null}
          {context}
        </p>
      ) : null}
    </div>
  );
}
