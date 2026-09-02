import { HeartPulse } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { HealthTrendChart } from '@/components/health/HealthTrendChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getDomainPages } from '@/lib/data/domain-pages';
import { periodLabel, parsePeriodParam } from '@/lib/periods';
import type { HealthMetricPeriod } from '@/types/domain-pages';

import pageStyles from '../page.module.scss';
import styles from './SaludPage.module.scss';

export const metadata: Metadata = { title: 'Salud' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function metricValue(metric: HealthMetricPeriod): string {
  if (metric.average === null) return 'Sin datos';
  return `${metric.averageLabel}${metric.unit ? ` ${metric.unit}` : ''}`;
}

function baselineValue(metric: HealthMetricPeriod): string {
  if (metric.baselineAverage === null) return 'Sin baseline';
  const base = `${metric.baselineLabel}${metric.unit ? ` ${metric.unit}` : ''}`;
  return metric.baselineCompare.available ? `${metric.baselineCompare.label} · base ${base}` : base;
}

function HealthMetricCard({
  metric,
  availableDays,
}: {
  metric: HealthMetricPeriod | undefined;
  availableDays: number;
}) {
  if (!metric) return null;

  return (
    <Card compact className={styles.metricCard}>
      <div className={styles.metricTop}>
        <div>
          <span className={styles.metricName}>{metric.label}</span>
          <div className={styles.metricValueRow}>
            <strong className={styles.metricValue}>{metric.averageLabel}</strong>
            {metric.average !== null && metric.unit ? (
              <span className={styles.metricUnit}>{metric.unit}</span>
            ) : null}
          </div>
        </div>
        <span className={styles.coverage}>
          {metric.coverageDays}/{availableDays || 0} días
        </span>
      </div>

      <HealthTrendChart
        values={metric.series}
        baseline={metric.baselineAverage}
        label={`Tendencia de ${metric.label}. Los huecos representan días sin dato.`}
      />

      <div className={styles.compareGrid}>
        <div className={styles.compareBlock}>
          <span className={styles.compareLabel}>vs período anterior</span>
          <strong className={styles.compareValue}>
            {metric.compare.available ? metric.compare.label : 'Sin comparación'}
          </strong>
        </div>
        <div className={styles.compareBlock}>
          <span className={styles.compareLabel}>vs baseline personal</span>
          <strong className={styles.compareValue}>{baselineValue(metric)}</strong>
        </div>
      </div>
    </Card>
  );
}

function CompactMetric({ metric }: { metric: HealthMetricPeriod | undefined }) {
  if (!metric) return null;
  return (
    <div className={styles.compactMetric}>
      <span className={styles.compactMetricLabel}>{metric.label}</span>
      <strong className={styles.compactMetricValue}>{metricValue(metric)}</strong>
    </div>
  );
}

function SleepStages({ metrics }: { metrics: readonly HealthMetricPeriod[] }) {
  const stages = [
    { id: 'core', label: 'Núcleo', stage: 'core' },
    { id: 'deep', label: 'Profundo', stage: 'deep' },
    { id: 'rem', label: 'REM', stage: 'rem' },
    { id: 'awake', label: 'Despierto', stage: 'awake' },
  ]
    .map((definition) => ({
      ...definition,
      metric: metrics.find((metric) => metric.id === definition.id),
    }))
    .filter(
      (stage): stage is (typeof stage & { metric: HealthMetricPeriod }) =>
        stage.metric !== undefined,
    );

  const total = stages.reduce(
    (sum, stage) => sum + (stage.metric.average !== null && stage.metric.average > 0 ? stage.metric.average : 0),
    0,
  );

  return (
    <Card compact className={styles.stageCard}>
      <h3 className={styles.stageTitle}>Etapas de sueño</h3>
      <p className={styles.stageCopy}>
        Distribución de los promedios registrados. No se calcula eficiencia si la fuente no aporta tiempo en cama confiable.
      </p>
      <div className={styles.stageBar} aria-label="Distribución promedio de etapas de sueño">
        {total > 0
          ? stages.map((stage) => {
              const value = stage.metric.average ?? 0;
              if (value <= 0) return null;
              return (
                <span
                  key={stage.id}
                  className={styles.stageSegment}
                  data-stage={stage.stage}
                  style={{ width: `${(value / total) * 100}%` }}
                  title={`${stage.label}: ${metricValue(stage.metric)}`}
                />
              );
            })
          : null}
      </div>
      <div className={styles.stageLegend}>
        {stages.map((stage) => (
          <div key={stage.id} className={styles.stageRow}>
            <span className={styles.stageDot} data-stage={stage.stage} aria-hidden="true" />
            <span>{stage.label}</span>
            <strong className={styles.stageValue}>{metricValue(stage.metric)}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function SaludPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const periodDays = parsePeriodParam(params.period);
  const data = await getDomainPages(periodDays);
  const health = data.health;
  const metric = (id: string) => health.metrics.find((candidate) => candidate.id === id);
  const trendText = health.summary.map((item) => `${item.label}: ${item.detail}`).join(' · ');

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

      <Card className={styles.summaryCard} aria-labelledby="health-summary-title">
        <div className={styles.summaryTop}>
          <p className={styles.eyebrow}>Resumen del período</p>
          <h2 id="health-summary-title" className={styles.summaryTitle}>
            Cómo venís, sin convertir ruido en un score inventado
          </h2>
          <p className={styles.summaryCopy}>
            Las señales comparan tu período actual con el anterior. El baseline personal usa los 30 días inmediatamente anteriores al período seleccionado y se mantiene separado de cualquier referencia poblacional.
          </p>
        </div>

        <div className={styles.summaryGrid}>
          {health.summary.map((item) => (
            <div key={item.id} className={styles.summaryItem} data-tone={item.tone}>
              <strong className={styles.summaryValue}>{item.label}</strong>
              <span className={styles.summaryDetail}>{item.detail}</span>
            </div>
          ))}
        </div>

        <p className={styles.metaLine}>
          <span>{health.today.label}</span>
          <span>{health.availableDays} días reales en período</span>
          <span>{health.previousAvailableDays} días en período anterior</span>
          <span>{health.baselineAvailableDays} días disponibles para baseline</span>
        </p>
      </Card>

      <section className={styles.sectionStack} aria-labelledby="sleep-title">
        <SectionHeader
          id="sleep-title"
          title="Sueño"
          description="Duración, tendencia y composición de etapas cuando la fuente las registra."
          domain="health"
        />
        <div className={styles.sleepGrid}>
          <HealthMetricCard metric={metric('sleep')} availableDays={health.availableDays} />
          <SleepStages metrics={health.metrics} />
        </div>
      </section>

      <section className={styles.sectionStack} aria-labelledby="recovery-title">
        <SectionHeader
          id="recovery-title"
          title="Corazón y recuperación"
          description="Tendencias personales; no son diagnósticos ni reemplazan evaluación médica."
          domain="health"
        />
        <div className={styles.sectionGrid} data-columns="3">
          <HealthMetricCard metric={metric('restingHr')} availableDays={health.availableDays} />
          <HealthMetricCard metric={metric('hrv')} availableDays={health.availableDays} />
          <HealthMetricCard metric={metric('meanHr')} availableDays={health.availableDays} />
        </div>
        <div className={styles.compactMetrics}>
          <CompactMetric metric={metric('minHr')} />
          <CompactMetric metric={metric('maxHr')} />
        </div>
      </section>

      <section className={styles.sectionStack} aria-labelledby="movement-title">
        <SectionHeader
          id="movement-title"
          title="Movimiento"
          description="Actividad cotidiana y métricas de marcha disponibles en el wearable."
          domain="health"
        />
        <div className={styles.sectionGrid}>
          <HealthMetricCard metric={metric('steps')} availableDays={health.availableDays} />
          <HealthMetricCard metric={metric('distance')} availableDays={health.availableDays} />
        </div>
        <div className={styles.compactMetrics}>
          <CompactMetric metric={metric('floors')} />
          <CompactMetric metric={metric('walkingSpeed')} />
          <CompactMetric metric={metric('stepLength')} />
          <CompactMetric metric={metric('walkingAsymmetry')} />
        </div>
      </section>

      <section className={styles.sectionStack} aria-labelledby="oxygen-activity-title">
        <SectionHeader
          id="oxygen-activity-title"
          title="Oxígeno y actividad"
          description="Cobertura y tendencia de SpO₂ y energía activa, sin aplicar umbrales clínicos automáticos."
          domain="health"
        />
        <div className={styles.sectionGrid}>
          <HealthMetricCard metric={metric('spo2')} availableDays={health.availableDays} />
          <HealthMetricCard metric={metric('calories')} availableDays={health.availableDays} />
        </div>
      </section>

      <Card className={styles.transparencyCard} aria-labelledby="health-reading-title">
        <SectionHeader
          id="health-reading-title"
          title="Qué está diciendo Vida"
          description="Separación explícita entre evidencia, tendencia y límites de interpretación."
          domain="health"
        />
        <div className={styles.transparencyGrid}>
          <div className={styles.transparencyItem} data-kind="observed">
            <span className={styles.transparencyLabel}>Observado</span>
            <p className={styles.transparencyText}>
              {health.availableDays} días contienen al menos una métrica real en este período; los huecos permanecen como faltantes, no como cero.
            </p>
          </div>
          <div className={styles.transparencyItem} data-kind="trend">
            <span className={styles.transparencyLabel}>Tendencia</span>
            <p className={styles.transparencyText}>{trendText || 'Todavía no hay una comparación suficiente.'}</p>
          </div>
          <div className={styles.transparencyItem}>
            <span className={styles.transparencyLabel}>Límite</span>
            <p className={styles.transparencyText}>
              Esta iteración no agrega benchmarks poblacionales, causalidad ni diagnósticos. Las referencias externas se incorporarán solo con fuente, población, fecha y confianza explícitas.
            </p>
          </div>
        </div>
      </Card>

      <Card as="details" className={styles.detailsCard}>
        <summary className={styles.detailsSummary}>Ver datos diarios e importación</summary>
        <div className={styles.detailsBody}>
          {health.history.length === 0 ? (
            <p className={styles.summaryCopy}>Sin días de salud en este período.</p>
          ) : (
            <ul className={styles.historyList}>
              {health.history.map((row) => (
                <li key={row.date} className={styles.historyRow}>
                  <span className={styles.historyDate}>{row.label}</span>
                  <span className={styles.historyMetric}>Sueño {row.sleep}</span>
                  <span className={styles.historyMetric}>Pasos {row.steps}</span>
                  <span className={styles.historyMetric}>FC {row.restingHr}</span>
                  <span className={styles.importBadge} data-kind={row.importKind}>
                    {row.importKind === 'partial' ? 'Parcial' : row.importKind === 'complete' ? 'Completa' : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
