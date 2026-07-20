import { Footprints, HeartPulse, Moon, Waves } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { HealthView } from '@/types';

import styles from './HealthSleep.module.scss';

export function HealthSleep({ health }: { health: HealthView }) {
  return (
    <Card aria-labelledby="health-title">
      <SectionHeader
        id="health-title"
        title="Salud y sueño"
        description="Comparado con días anteriores."
        icon={HeartPulse}
        domain="health"
      />
      <div className={styles.grid}>
        <MetricCard
          label="Sueño total"
          value={health.sleep.value}
          unit={health.sleep.unit}
          context={health.sleep.context}
          status={health.sleep.status}
          trend={health.sleep.trend}
          icon={Moon}
          domain="health"
        />
        <MetricCard
          label="Sueño profundo"
          value={health.deepSleep.value}
          unit={health.deepSleep.unit}
          context={health.deepSleep.context}
          status={health.deepSleep.status}
          trend={health.deepSleep.trend}
          icon={Waves}
          domain="health"
        />
        <MetricCard
          label="FC en reposo"
          value={health.restingHeartRate.value}
          unit={health.restingHeartRate.unit}
          context={health.restingHeartRate.context}
          status={health.restingHeartRate.status}
          trend={health.restingHeartRate.trend}
          icon={HeartPulse}
          domain="health"
        />
        <MetricCard
          label="Pasos"
          value={health.steps.value}
          unit={health.steps.unit}
          context={health.steps.context}
          status={health.steps.status}
          trend={health.steps.trend}
          icon={Footprints}
          domain="health"
        />
      </div>
    </Card>
  );
}
