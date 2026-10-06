import type { LucideIcon } from 'lucide-react';

import { CompareHint } from '@/components/domain/CompareHint';
import { SparkBars } from '@/components/domain/SparkBars';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { HealthMetricGroupId, HealthPageData } from '@/types/domain-pages';

import styles from './HealthMetricGroup.module.scss';

export function HealthMetricGroup({
  health,
  groups,
  title,
  description,
  icon: Icon,
}: {
  health: HealthPageData;
  groups: readonly HealthMetricGroupId[];
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  const metrics = health.metrics.filter((metric) => groups.includes(metric.group));
  if (metrics.length === 0) return null;

  return (
    <Card>
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true">
          <Icon size={18} />
        </span>
        <SectionHeader title={title} description={description} domain="health" />
      </div>

      <div className={styles.grid}>
        {metrics.map((metric) => (
          <article key={metric.id} className={styles.metric}>
            <div className={styles.top}>
              <span>{metric.label}</span>
              <small>{metric.coverageDays} d</small>
            </div>
            <p className={`${styles.value} tabular`}>
              {metric.averageLabel}
              {metric.average === null || !metric.unit ? null : <span>{metric.unit}</span>}
            </p>
            <div className={styles.spark}>
              <SparkBars
                values={metric.series}
                label={`Tendencia de ${metric.label}`}
                domain="health"
              />
            </div>
            <div className={styles.comparisons}>
              <CompareHint compare={metric.compare} prefix="vs. período anterior" />
              <CompareHint compare={metric.baselineCompare} prefix="vs. base 30d" />
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
