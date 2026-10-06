import { Activity, HeartPulse } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import styles from '@/components/domain/DomainPage.module.scss';
import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import {
  HealthContextSection,
  HealthPrioritiesSection,
  HealthTodayHero,
  HealthTrajectorySection,
} from '@/components/health/HealthIntelligenceSections';
import { HealthNavigation } from '@/components/health/HealthNavigation';
import {
  HealthLongitudinalSummary,
  HealthReadinessSummary,
} from '@/components/health/HealthScoreCards';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { loadHealthPageModel } from '@/lib/health/page-data';
import { periodLabel, parsePeriodParam } from '@/lib/periods';
import type { HealthInsightKind } from '@/types/domain-pages';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Salud' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHANGE_KIND_LABELS: Readonly<Record<HealthInsightKind, string>> = {
  fact: 'Hecho',
  trend: 'Tendencia',
  context: 'Contexto',
};

export default async function SaludPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const periodDays = parsePeriodParam(params.period);
  const { health, intelligence, deviationRadar } = await loadHealthPageModel(periodDays);
  const actionable = intelligence.priorities.filter((priority) => priority.id !== 'maintenance');

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Salud"
        description={`${periodLabel(periodDays)} · ${health.availableDays} días con datos reales`}
        icon={HeartPulse}
        domain="health"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />
      <HealthNavigation current="summary" />

      {health.notice ? <IntegrationNotice status={health.status} message={health.notice} /> : null}

      <HealthTodayHero
        brief={intelligence.dailyBrief}
        state={intelligence.currentState}
        quality={intelligence.evidenceQuality}
      />

      <HealthReadinessSummary score={intelligence.scores.readiness} />

      <HealthTrajectorySection trajectory={intelligence.trajectory} />

      <Card aria-labelledby="health-insights-title">
        <SectionHeader
          id="health-insights-title"
          title="Qué cambió"
          description="Sólo cambios materiales, cobertura y contexto temporal relevante."
          domain="health"
        />
        <div className={local['insight-grid']}>
          {intelligence.changes.map((insight) => (
            <article key={insight.id} className={local.insight} data-tone={insight.tone}>
              <span className={local['insight-dot']} aria-hidden="true" />
              <div>
                <p className={local['insight-kind']} data-kind={insight.kind}>
                  {CHANGE_KIND_LABELS[insight.kind]}
                </p>
                <h3>{insight.title}</h3>
                <p>{insight.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <HealthContextSection context={intelligence.crossDomain} />

      {actionable.length > 0 ? <HealthPrioritiesSection priorities={actionable} /> : null}

      <HealthLongitudinalSummary momentum={intelligence.scores.momentum} radar={deviationRadar} />

      <details className={local['coverage-disclosure']}>
        <summary>
          <span>
            <Activity size={16} aria-hidden="true" />
            <strong>Datos y cobertura</strong>
          </span>
          <small>
            {health.availableDays}/{periodDays} días · {health.partialDays} parcial(es)
          </small>
        </summary>
        <div className={local['coverage-body']}>
          <div className={local['coverage-head']}>
            <span className={local['today-state']} data-kind={health.today.kind}>
              <Activity size={17} aria-hidden="true" />
              <span>
                <strong>{health.today.label}</strong>
                {health.today.details ? <small>{health.today.details}</small> : null}
              </span>
            </span>
          </div>

          <div className={local['summary-grid']}>
            <div className={local['summary-item']}>
              <span>Con datos</span>
              <strong className="tabular">{health.availableDays}</strong>
              <small>de {periodDays} días</small>
            </div>
            <div className={local['summary-item']}>
              <span>Completos</span>
              <strong className="tabular">{health.completeDays}</strong>
              <small>importaciones</small>
            </div>
            <div
              className={local['summary-item']}
              data-tone={health.partialDays > 0 ? 'watch' : 'neutral'}
            >
              <span>Parciales</span>
              <strong className="tabular">{health.partialDays}</strong>
              <small>en reconciliación</small>
            </div>
            <div className={local['summary-item']}>
              <span>Base personal</span>
              <strong className="tabular">{health.signals.baselineCoverageDays}</strong>
              <small>de {health.signals.baselineWindowDays} días</small>
            </div>
          </div>

          {health.history.length > 0 ? (
            <div className={styles['table-wrap']}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Sueño</th>
                    <th scope="col">Pasos</th>
                    <th scope="col">FC reposo</th>
                    <th scope="col">Importación</th>
                  </tr>
                </thead>
                <tbody>
                  {health.history.map((row) => (
                    <tr key={row.date}>
                      <td>{row.label}</td>
                      <td className="tabular">{row.sleep}</td>
                      <td className="tabular">{row.steps}</td>
                      <td className="tabular">{row.restingHr}</td>
                      <td>
                        {row.importKind === 'partial'
                          ? 'Parcial'
                          : row.importKind === 'source-incomplete'
                            ? 'Incompleta'
                            : 'Completa'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
