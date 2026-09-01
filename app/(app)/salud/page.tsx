import { Activity, Flame, Footprints, HeartPulse, Moon, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import type { HealthMetricGroupId } from '@/types/domain-pages';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Salud' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type GroupDefinition = {
  id: HealthMetricGroupId;
  title: string;
  description: string;
  icon: LucideIcon;
};

const GROUPS: readonly GroupDefinition[] = [
  {
    id: 'sleep',
    title: 'Sueño',
    description: 'Duración y composición del sueño, sin completar huecos con cero.',
    icon: Moon,
  },
  {
    id: 'cardio',
    title: 'Corazón y recuperación',
    description: 'Frecuencia cardíaca y HRV como señales de tendencia, no como diagnóstico.',
    icon: HeartPulse,
  },
  {
    id: 'movement',
    title: 'Movimiento',
    description: 'Actividad diaria, distancia y métricas de marcha disponibles.',
    icon: Footprints,
  },
  {
    id: 'oxygen',
    title: 'Oxígeno',
    description: 'SpO₂ cuando la fuente entrega datos suficientes.',
    icon: Wind,
  },
  {
    id: 'energy',
    title: 'Energía',
    description: 'Gasto activo y energía de reposo derivada de la fuente canónica.',
    icon: Flame,
  },
];

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
        description={`${periodLabel(periodDays)} · ${health.availableDays} días con datos reales`}
        icon={HeartPulse}
        domain="health"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />

      {health.notice ? <IntegrationNotice status={health.status} message={health.notice} /> : null}

      <section className={local.hero} aria-labelledby="health-overview-title">
        <div className={local['hero-top']}>
          <div>
            <p className={local.eyebrow}>Salud V2</p>
            <h2 id="health-overview-title" className={local['hero-title']}>
              Tu estado en una mirada
            </h2>
            <p className={local['hero-text']}>
              Primero tu evolución personal: período anterior + base de 30 días. Las referencias
              poblacionales se agregarán aparte y con fuente explícita.
            </p>
          </div>
          <div className={local['today-state']} data-kind={health.today.kind}>
            <Activity size={17} aria-hidden="true" />
            <span>
              <strong>{health.today.label}</strong>
              {health.today.details ? <small>{health.today.details}</small> : null}
            </span>
          </div>
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
            <small>sin inventar faltantes</small>
          </div>
          <div className={local['summary-item']}>
            <span>Base personal</span>
            <strong className="tabular">{health.baselineDays}</strong>
            <small>días previos disponibles</small>
          </div>
        </div>
      </section>

      <Card aria-labelledby="health-insights-title">
        <SectionHeader
          id="health-insights-title"
          title="Qué cambió"
          description="Observaciones determinísticas. No se presentan asociaciones como causas ni se hacen diagnósticos."
          domain="health"
        />
        <div className={local['insight-grid']}>
          {health.insights.map((insight) => (
            <article key={insight.id} className={local.insight} data-tone={insight.tone}>
              <span className={local['insight-dot']} aria-hidden="true" />
              <div>
                <h3>{insight.title}</h3>
                <p>{insight.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </Card>

      {GROUPS.map((group) => {
        const metrics = health.metrics.filter((metric) => metric.group === group.id);
        if (metrics.length === 0) return null;
        const Icon = group.icon;

        return (
          <Card key={group.id} aria-labelledby={`health-${group.id}-title`}>
            <div className={local['section-heading']}>
              <span className={local['section-icon']} aria-hidden="true">
                <Icon size={18} />
              </span>
              <SectionHeader
                id={`health-${group.id}-title`}
                title={group.title}
                description={group.description}
                domain="health"
              />
            </div>

            <div className={local['metric-grid']}>
              {metrics.map((metric) => (
                <article key={metric.id} className={local['metric-card']}>
                  <div className={local['metric-top']}>
                    <span>{metric.label}</span>
                    <small>{metric.coverageDays} d</small>
                  </div>
                  <p className={`${local['metric-value']} tabular`}>
                    {metric.averageLabel}
                    {metric.average === null || !metric.unit ? null : (
                      <span>{metric.unit}</span>
                    )}
                  </p>
                  <div className={local['spark-wrap']}>
                    <SparkBars
                      values={metric.series}
                      label={`Tendencia de ${metric.label}`}
                      domain="health"
                    />
                  </div>
                  <div className={local.comparisons}>
                    <CompareHint compare={metric.compare} prefix="vs. período anterior" />
                    <CompareHint compare={metric.baselineCompare} prefix="vs. base 30d" />
                  </div>
                </article>
              ))}
            </div>
          </Card>
        );
      })}

      <Card aria-labelledby="health-history-title">
        <SectionHeader
          id="health-history-title"
          title="Historial diario"
          description="Detalle crudo útil para auditar la lectura visual. Los faltantes siguen siendo faltantes."
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
                  <th scope="col">FC reposo</th>
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
