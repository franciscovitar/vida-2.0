import { LineChart } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CompareHint } from '@/components/domain/CompareHint';
import styles from '@/components/domain/DomainPage.module.scss';
import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { SparkBars } from '@/components/domain/SparkBars';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getDomainPages } from '@/lib/data/domain-pages';
import { periodLabel, parsePeriodParam } from '@/lib/periods';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Tendencias' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sourceLabel(source: 'mock' | 'google'): string {
  return source === 'mock' ? 'Mock' : 'Sheet DEV';
}

function rhoLabel(rho: number | null): string {
  if (rho === null) return '—';
  const sign = rho > 0 ? '+' : rho < 0 ? '−' : '';
  return `${sign}${Math.abs(rho).toFixed(3)}`;
}

export default async function TendenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const periodDays = parsePeriodParam(params.period);
  const data = await getDomainPages(periodDays);
  const t = data.trends;

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Tendencias"
        description={`${periodLabel(periodDays)} · ${sourceLabel(t.source)} · hábitos ${t.coverage.habitsDays} · salud ${t.coverage.healthDays} · productividad ${t.coverage.productivityDays}`}
        icon={LineChart}
        domain="productivity"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />

      {t.notice ? <IntegrationNotice status={t.status} message={t.notice} /> : null}

      <p className={styles['meta-line']}>
        <span>
          {t.periodStart} → {t.periodEnd}
        </span>
        <span>Fuente: {sourceLabel(t.source)}</span>
        {t.coverage.insufficientSample ? <span>Muestra limitada</span> : null}
      </p>

      <Card aria-labelledby="trends-summary-title">
        <SectionHeader
          id="trends-summary-title"
          title="Resumen del período"
          description="Valores actuales frente al período anterior de igual duración."
          domain="productivity"
        />
        <ul className={styles.list}>
          {t.summary.map((metric) => (
            <li key={metric.id} className={styles.item}>
              <div className={styles.name}>
                <span className={styles.title}>{metric.label}</span>
                <span className={styles.sub}>Cobertura: {metric.coverageLabel}</span>
              </div>
              <div className={local.values}>
                <span className={`${styles.stat} tabular`}>{metric.currentLabel}</span>
                <span className={styles.sub}>Anterior: {metric.previousLabel}</span>
              </div>
              <div className={styles.right}>
                <span className={styles.sub}>{metric.deltaLabel}</span>
                <CompareHint compare={metric.compare} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="trends-evo-title">
        <SectionHeader
          id="trends-evo-title"
          title="Evolución diaria"
          description="Huecos = sin dato ese día (no se completa con cero)."
          domain="productivity"
        />
        <ul className={styles.list}>
          {t.evolution.map((series) => (
            <li key={series.id} className={styles.item}>
              <div className={styles.name}>
                <span className={styles.title}>{series.label}</span>
                <span className={styles.sub}>{series.unit || 'unidades'}</span>
              </div>
              <SparkBars
                values={series.values}
                label={`Evolución de ${series.label}`}
                domain={series.domain}
              />
              <span className={styles.sub}>
                {series.values.filter((v) => v !== null).length} puntos
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="trends-rel-title">
        <SectionHeader
          id="trends-rel-title"
          title="Relaciones y asociaciones"
          description="Solo fechas con ambas variables presentes. Sin causalidad."
          domain="productivity"
        />
        <div className={local['table-wrap']} role="region" aria-label="Asociaciones">
          <table className={local.table}>
            <thead>
              <tr>
                <th scope="col">Relación</th>
                <th scope="col">Pares</th>
                <th scope="col">ρ</th>
                <th scope="col">Nivel</th>
                <th scope="col">Muestra</th>
              </tr>
            </thead>
            <tbody>
              {t.relations.map((rel) => (
                <tr key={rel.id}>
                  <td>
                    {rel.labelX} vs {rel.labelY}
                  </td>
                  <td className="tabular">{rel.pairs}</td>
                  <td className="tabular">{rhoLabel(rel.result.rho)}</td>
                  <td>{rel.result.strengthLabel}</td>
                  <td>{rel.result.confidenceLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={local.notes}>
          {t.relations
            .filter((rel) => rel.result.rho !== null)
            .slice(0, 4)
            .map((rel) => (
              <li key={`sum-${rel.id}`}>{rel.summary}</li>
            ))}
        </ul>
        <p className={local.disclaimer}>
          Las asociaciones no demuestran causalidad; describen coincidencias en días con datos
          reales.
        </p>
      </Card>

      <Card aria-labelledby="trends-week-title">
        <SectionHeader
          id="trends-week-title"
          title="Patrones semanales"
          description={
            t.weekday.bestDayLabel
              ? `Mejor día (hábitos): ${t.weekday.bestDayLabel}. Menor: ${t.weekday.worstDayLabel}.`
              : 'Promedios por día de la semana.'
          }
          domain="habits"
        />
        {t.weekday.notice ? <p className={styles.sub}>{t.weekday.notice}</p> : null}
        <div className={local['table-wrap']} role="region" aria-label="Patrones semanales">
          <table className={local.table}>
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">n</th>
                <th scope="col">Sueño</th>
                <th scope="col">Hábitos</th>
                <th scope="col">Trabajo</th>
                <th scope="col">Facultad</th>
                <th scope="col">Energía</th>
              </tr>
            </thead>
            <tbody>
              {t.weekday.rows.map((row) => (
                <tr key={row.weekday} data-sparse={row.sparse || undefined}>
                  <td>
                    {row.label}
                    {row.sparse ? ' *' : ''}
                  </td>
                  <td className="tabular">{row.observations}</td>
                  <td>{row.sleepLabel}</td>
                  <td>{row.habitLabel}</td>
                  <td>{row.workLabel}</td>
                  <td>{row.facultyLabel}</td>
                  <td>{row.energyLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.sub}>
          * Pocas observaciones: no comparar como si fuera una muestra plena.
        </p>
      </Card>

      <Card aria-labelledby="trends-quality-title">
        <SectionHeader
          id="trends-quality-title"
          title="Calidad de datos"
          description="Cobertura independiente por dominio y pares coincidentes."
          domain="neutral"
        />
        <ul className={local.quality}>
          <li>Hábitos: {t.quality.habitsDays} días</li>
          <li>Salud: {t.quality.healthDays} días</li>
          <li>Productividad: {t.quality.productivityDays} días</li>
          <li>Salud parcial: {t.quality.partialHealthDays} días</li>
          <li>Sin datos: {t.quality.daysWithoutAny} días</li>
        </ul>
        <ul className={local.notes}>
          {t.quality.relationPairCounts.map((item) => (
            <li key={item.id}>
              {item.label}: {item.pairs} pares
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
