import { ListTodo } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CompareHint } from '@/components/domain/CompareHint';
import { DistributionBars } from '@/components/domain/DistributionBars';
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

export const metadata: Metadata = { title: 'Productividad' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ProductividadPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const periodDays = parsePeriodParam(params.period);
  const data = await getDomainPages(periodDays);
  const page = data.productivity;

  const distribution = page.categories.filter((category) =>
    ['work', 'faculty', 'vida2', 'leisure', 'unclassified'].includes(category.id),
  );

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Productividad"
        description={`${periodLabel(periodDays)} · ${page.availableDays} días con ActivityWatch`}
        icon={ListTodo}
        domain="productivity"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />

      {page.notice ? <IntegrationNotice status={page.status} message={page.notice} /> : null}

      <p className={styles['meta-line']}>
        <span>{page.coverageLabel}</span>
        <span>
          {page.daysWithoutAw > 0
            ? `${page.daysWithoutAw} días sin ActivityWatch`
            : 'Cobertura completa del período'}
        </span>
      </p>

      <div className={styles.metrics}>
        <MetricCard
          label="PC activa"
          value={page.activeTotalLabel}
          context={`Promedio ${page.activeAverageLabel}`}
          trend={
            page.activeCompare.direction === 'up' ||
            page.activeCompare.direction === 'down' ||
            page.activeCompare.direction === 'steady'
              ? page.activeCompare.direction
              : undefined
          }
          domain="productivity"
        />
        {page.categories
          .filter((category) => ['work', 'faculty', 'vida2', 'leisure'].includes(category.id))
          .map((category) => (
            <MetricCard
              key={category.id}
              label={category.label}
              value={category.totalLabel}
              context={`${category.dailyAverageLabel}/día · ${category.shareLabel} PC`}
              trend={
                category.compare.direction === 'up' ||
                category.compare.direction === 'down' ||
                category.compare.direction === 'steady'
                  ? category.compare.direction
                  : undefined
              }
              domain={category.domain}
            />
          ))}
      </div>

      <Card aria-labelledby="prod-dist-title">
        <SectionHeader
          id="prod-dist-title"
          title="Distribución de tiempo"
          description="Totales del período. Cero es cero; sin dato no aparece como barra."
          domain="productivity"
        />
        <DistributionBars
          max={page.distributionMax}
          items={distribution.map((category) => ({
            id: category.id,
            label: category.label,
            valueLabel: category.totalLabel,
            fill: category.totalMinutes,
            domain: category.domain,
          }))}
        />
      </Card>

      <Card aria-labelledby="prod-cats-title">
        <SectionHeader
          id="prod-cats-title"
          title="Categorías"
          description="Comparación contra el período anterior equivalente."
          domain="productivity"
        />
        <ul className={styles.list}>
          {page.categories.map((category) => (
            <li key={category.id} className={styles.item}>
              <div className={styles.name}>
                <span className={styles.title}>{category.label}</span>
                <span className={styles.sub}>
                  Total {category.totalLabel} · promedio {category.dailyAverageLabel}
                </span>
              </div>
              <SparkBars
                values={category.series}
                label={`Serie de ${category.label}`}
                domain={category.domain}
              />
              <div className={styles.right}>
                <CompareHint compare={category.compare} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="prod-history-title">
        <SectionHeader
          id="prod-history-title"
          title="Historial diario"
          description="Solo días con datos reales. — indica ausencia, 0 min es cero."
          domain="productivity"
        />
        {page.history.length === 0 ? (
          <p className={styles.sub}>Sin días de productividad en este período.</p>
        ) : (
          <div className={styles['table-wrap']}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Trabajo</th>
                  <th scope="col">Facultad</th>
                  <th scope="col">Vida 2.0</th>
                  <th scope="col">Ocio</th>
                  <th scope="col">PC activa</th>
                  <th scope="col">Sin clasificar</th>
                </tr>
              </thead>
              <tbody>
                {page.history.map((row) => (
                  <tr key={row.date}>
                    <td>{row.label}</td>
                    <td className="tabular">{row.work}</td>
                    <td className="tabular">{row.faculty}</td>
                    <td className="tabular">{row.vida2}</td>
                    <td className="tabular">{row.leisure}</td>
                    <td className="tabular">{row.active}</td>
                    <td className="tabular">{row.unclassified}</td>
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
