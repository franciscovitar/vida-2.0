import { HeartPulse } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CompareHint } from '@/components/domain/CompareHint';
import styles from '@/components/domain/DomainPage.module.scss';
import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { SparkBars } from '@/components/domain/SparkBars';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getDomainPages } from '@/lib/data/domain-pages';
import { periodLabel, parsePeriodParam } from '@/lib/periods';

import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'Salud' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function SaludPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const periodDays = parsePeriodParam(params.period);
  const data = await getDomainPages(periodDays);
  const health = data.health;

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Salud"
        description={`${periodLabel(periodDays)} · ${health.availableDays} días con datos`}
        icon={HeartPulse}
        domain="health"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />

      {health.notice ? <IntegrationNotice status={health.status} message={health.notice} /> : null}

      <p className={styles['meta-line']}>
        <span>{health.today.label}</span>
        <span>{health.availableDays} días reales</span>
        <span>Anterior: {health.previousAvailableDays} días</span>
      </p>

      <div className={styles.metrics}>
        {health.metrics.map((metric) => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.averageLabel}
            unit={metric.average === null ? undefined : metric.unit || undefined}
            context={metric.compare.label}
            trend={
              metric.compare.direction === 'up' ||
              metric.compare.direction === 'down' ||
              metric.compare.direction === 'steady'
                ? metric.compare.direction
                : undefined
            }
            status="neutral"
            domain={metric.domain}
          />
        ))}
      </div>

      <Card aria-labelledby="health-trends-title">
        <SectionHeader
          id="health-trends-title"
          title="Tendencias"
          description="Series del período. Los huecos son días sin dato, no ceros."
          domain="health"
        />
        <ul className={styles.list}>
          {health.metrics.map((metric) => (
            <li key={metric.id} className={styles.item}>
              <div className={styles.name}>
                <span className={styles.title}>{metric.label}</span>
                <span className={styles.sub}>
                  Promedio:{' '}
                  {metric.average === null
                    ? 'Sin datos'
                    : `${metric.averageLabel}${metric.unit ? ` ${metric.unit}` : ''}`}
                </span>
              </div>
              <SparkBars
                values={metric.series}
                label={`Tendencia de ${metric.label}`}
                domain="health"
              />
              <div className={styles.right}>
                <CompareHint compare={metric.compare} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="health-history-title">
        <SectionHeader
          id="health-history-title"
          title="Historial diario"
          description="No se convierten datos faltantes en cero."
          domain="health"
        />
        {health.history.length === 0 ? (
          <p className={styles.sub}>Sin días de salud en este período.</p>
        ) : (
          <div className={styles['table-wrap']}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Sueño</th>
                  <th scope="col">Pasos</th>
                  <th scope="col">FC</th>
                  <th scope="col">Importación</th>
                  <th scope="col">Entrenamiento</th>
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
                      <span className={styles.badge} data-kind={row.importKind}>
                        {row.importKind === 'partial'
                          ? 'Parcial'
                          : row.importKind === 'complete'
                            ? 'Completa'
                            : '—'}
                      </span>
                    </td>
                    <td>{row.workout}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
