import { HeartPulse, Wind } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { HealthMetricGroup } from '@/components/health/HealthMetricGroup';
import { HealthNavigation } from '@/components/health/HealthNavigation';
import { HealthDomainScoreCard } from '@/components/health/HealthScoreCards';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadHealthPageModel } from '@/lib/health/page-data';
import { parsePeriodParam } from '@/lib/periods';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Corazón · Salud' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HealthHeartPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const periodDays = parsePeriodParam((await searchParams).period);
  const { health, intelligence } = await loadHealthPageModel(periodDays);
  const cardioScore = intelligence.scores.domains.find((score) => score.id === 'cardio-stability');

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Corazón"
        description="Frecuencia cardíaca, estabilidad personal y oxígeno como tendencias, no diagnóstico."
        icon={HeartPulse}
        domain="health"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />
      <HealthNavigation current="heart" />
      {health.notice ? <IntegrationNotice status={health.status} message={health.notice} /> : null}
      {cardioScore ? <HealthDomainScoreCard score={cardioScore} /> : null}
      <HealthMetricGroup
        health={health}
        groups={['cardio']}
        title="Corazón y recuperación"
        description="Frecuencia cardíaca y HRV cuando la fuente las entrega con evidencia utilizable."
        icon={HeartPulse}
      />
      <HealthMetricGroup
        health={health}
        groups={['oxygen']}
        title="Oxígeno"
        description="SpO₂ como señal longitudinal contextual cuando existe cobertura suficiente."
        icon={Wind}
      />
    </div>
  );
}
