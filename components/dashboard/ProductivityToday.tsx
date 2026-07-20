import { ArrowDownRight, ArrowUpRight, Minus, MonitorSmartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { DeltaDirection, ProductivityView } from '@/types';

import styles from './ProductivityToday.module.scss';

const DELTA_ICON: Record<Exclude<DeltaDirection, 'none'>, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  steady: Minus,
};

const DELTA_STATUS: Record<Exclude<DeltaDirection, 'none'>, string> = {
  up: 'up',
  down: 'down',
  steady: 'neutral',
};

function Delta({
  direction,
  label,
  iconSize = 12,
}: {
  direction: DeltaDirection;
  label: string;
  iconSize?: number;
}) {
  if (direction === 'none') return null;
  const Icon = DELTA_ICON[direction];
  return (
    <span className={styles.delta} data-status={DELTA_STATUS[direction]}>
      <Icon size={iconSize} strokeWidth={2.5} aria-hidden="true" />
      <span className="tabular">{label}</span> vs ayer
    </span>
  );
}

export function ProductivityToday({ productivity }: { productivity: ProductivityView }) {
  const { active, rows, maxMinutes } = productivity;

  return (
    <Card aria-labelledby="productivity-title">
      <SectionHeader
        id="productivity-title"
        title="Productividad"
        description="Tiempo por área (ActivityWatch)."
        icon={MonitorSmartphone}
        domain="productivity"
      />
      <div className={styles.total}>
        <div>
          <p className={styles['total-label']}>PC activa</p>
          <p className={`${styles['total-value']} tabular`}>{active.value}</p>
        </div>
        <Delta direction={active.delta.direction} label={active.delta.label} iconSize={14} />
      </div>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.id} className={styles.item}>
            <div className={styles.row}>
              <span className={styles.name}>{row.label}</span>
              <span className={`${styles.value} tabular`}>{row.value}</span>
            </div>
            <ProgressBar
              value={row.fillMinutes}
              max={maxMinutes}
              domain={row.domain}
              size="sm"
              label={`${row.label}: ${row.value}`}
            />
            <Delta direction={row.delta.direction} label={row.delta.label} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
