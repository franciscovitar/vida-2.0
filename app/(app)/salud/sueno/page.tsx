import { Moon } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { HealthMetricGroup } from '@/components/health/HealthMetricGroup';
import { HealthNavigation } from '@/components/health/HealthNavigation';
import { HealthDomainScoreCard, HealthRhythmCard } from '@/components/health/HealthScoreCards';
import { PageHeader } from '@/components/layout/PageHeader';
import { loadHealthPageModel } from '@/lib/health/page-data';
import { parsePeriodParam } from '@/lib/periods';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Sueño · Salud' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HealthSleepPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const periodDays = parsePeriodParam((await searchParams).period);
  const { health, rhythm, intelligence } = await loadHealthPageModel(periodDays);
  const sleepScore = intelligence.scores.domains.find((score) => score.id === 'sleep');

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Sueño"
        description="Duración, regularidad y composición del sueño desde fuentes objetivas."
        icon={Moon}
        domain="health"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />
      <HealthNavigation current="sleep" />
      {health.notice ? <IntegrationNotice status={health.status} message={health.notice} /> : null}
      {sleepScore ? <HealthDomainScoreCard score={sleepScore} /> : null}
      <HealthRhythmCard rhythm={rhythm} />
      <HealthMetricGroup
        health={health}
        groups={['sleep']}
        title="Sueño registrado"
        description="Duración y composición. Los faltantes permanecen faltantes y no se convierten en cero."
        icon={Moon}
      />
    </div>
  );
}
