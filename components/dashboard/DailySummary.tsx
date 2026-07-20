import { BatteryMedium, BrainCircuit, Briefcase, GraduationCap, Moon } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { SummaryView } from '@/types';

import styles from './DailySummary.module.scss';

export function DailySummary({ summary }: { summary: SummaryView }) {
  return (
    <Card aria-labelledby="summary-title">
      <SectionHeader
        id="summary-title"
        title="Resumen diario"
        description="Una lectura rápida de cómo va el día."
        icon={BrainCircuit}
        domain="productivity"
      />
      <div className={styles.grid}>
        <MetricCard
          label="Hábitos"
          value={summary.habits.value}
          context={summary.habits.context}
          status={summary.habits.status}
          trend={summary.habits.trend}
          icon={BatteryMedium}
          domain="habits"
        />
        <MetricCard
          label="Sueño"
          value={summary.sleep.value}
          unit={summary.sleep.unit}
          context={summary.sleep.context}
          status={summary.sleep.status}
          trend={summary.sleep.trend}
          icon={Moon}
          domain="health"
        />
        <MetricCard
          label="Trabajo"
          value={summary.work.value}
          unit={summary.work.unit}
          context={summary.work.context}
          status={summary.work.status}
          trend={summary.work.trend}
          icon={Briefcase}
          domain="productivity"
        />
        <MetricCard
          label="Facultad"
          value={summary.faculty.value}
          unit={summary.faculty.unit}
          context={summary.faculty.context}
          status={summary.faculty.status}
          trend={summary.faculty.trend}
          icon={GraduationCap}
          domain="learning"
        />
        <MetricCard
          label="Energía"
          value={summary.energy.value}
          unit={summary.energy.unit}
          context={summary.energy.context}
          status={summary.energy.status}
          trend={summary.energy.trend}
          icon={BatteryMedium}
          domain="habits"
        />
      </div>
    </Card>
  );
}
