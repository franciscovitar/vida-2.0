import { Flame, Footprints } from 'lucide-react';
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

export const metadata: Metadata = { title: 'Actividad · Salud' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HealthActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const periodDays = parsePeriodParam((await searchParams).period);
  const { health, intelligence } = await loadHealthPageModel(periodDays);
  const activityScore = intelligence.scores.domains.find((score) => score.id === 'activity');
  const mobilityScore = intelligence.scores.domains.find((score) => score.id === 'mobility');

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Actividad"
        description="Movimiento diario, movilidad y gasto energético en contexto longitudinal."
        icon={Footprints}
        domain="health"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />
      <HealthNavigation current="activity" />
      {health.notice ? <IntegrationNotice status={health.status} message={health.notice} /> : null}
      {activityScore ? <HealthDomainScoreCard score={activityScore} /> : null}
      {mobilityScore ? <HealthDomainScoreCard score={mobilityScore} /> : null}
      <HealthMetricGroup
        health={health}
        groups={['movement']}
        title="Movimiento y movilidad"
        description="Pasos, distancia y señales de marcha interpretadas principalmente contra tu propia historia."
        icon={Footprints}
      />
      <HealthMetricGroup
        health={health}
        groups={['energy']}
        title="Energía"
        description="Gasto activo y energía de reposo como contexto; no dominan el estado diario."
        icon={Flame}
      />
    </div>
  );
}
