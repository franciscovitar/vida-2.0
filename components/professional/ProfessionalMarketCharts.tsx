import {
  canCompareVisualMetrics,
  type VisualMetric,
  type VisualMetricKind,
  type VisualPanel,
} from '@/lib/professional/visualization-contract';
import type { ProfessionalVisualizationData } from '@/lib/professional/visualization';

import styles from './ProfessionalMarketCharts.module.scss';

const FOCUS_OCCUPATIONS = ['15-1252', '15-2051', '15-1212'] as const;

const OCCUPATION_LABELS: Record<string, string> = {
  '15-1252': 'Desarrollo de software',
  '15-1254': 'Desarrollo web',
  '15-1211': 'Análisis de sistemas',
  '15-1212': 'Seguridad informática',
  '15-1241': 'Arquitectura de redes',
  '15-1243': 'Arquitectura de bases de datos',
  '15-2051': 'Ciencia de datos',
  '15-1253': 'QA y testing de software',
};

const METRICS: {
  kind: VisualMetricKind;
  heading: string;
  explanation: string;
}[] = [
  {
    kind: 'EMPLOYMENT_GROWTH_PERCENT',
    heading: 'Crecimiento del empleo (%)',
    explanation: 'El aumento relativo puede ser alto incluso en sectores pequeños.',
  },
  {
    kind: 'NET_NEW_JOBS',
    heading: 'Puestos netos adicionales',
    explanation: 'Cambio entre el empleo estimado de 2025 y el proyectado para 2035.',
  },
  {
    kind: 'ANNUAL_OPENINGS',
    heading: 'Aperturas anuales',
    explanation: 'Incluye tanto puestos nuevos como reemplazos de trabajadores.',
  },
];

const FORMAT_NUMBER = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
});

const FORMAT_PERCENT = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function formatValue(value: number, kind: VisualMetricKind): string {
  return kind === 'EMPLOYMENT_GROWTH_PERCENT'
    ? FORMAT_PERCENT.format(value) + '%'
    : FORMAT_NUMBER.format(value);
}

function metricRows(panel: VisualPanel | undefined, kind: VisualMetricKind): VisualMetric[] | null {
  if (panel?.state !== 'AVAILABLE') return null;
  const rows = panel.metrics.filter((metric) => metric.kind === kind);

  if (
    rows.length !== 8 ||
    new Set(rows.map((row) => row.occupationCode)).size !== rows.length ||
    !rows.every((row) => canCompareVisualMetrics(row, rows[0])) ||
    FOCUS_OCCUPATIONS.some((code) => !rows.some((row) => row.occupationCode === code))
  ) {
    return null;
  }

  return [...rows].sort((a, b) => {
    const left = FOCUS_OCCUPATIONS.indexOf(a.occupationCode as (typeof FOCUS_OCCUPATIONS)[number]);
    const right = FOCUS_OCCUPATIONS.indexOf(b.occupationCode as (typeof FOCUS_OCCUPATIONS)[number]);
    if (left === -1 && right === -1) return a.label.localeCompare(b.label, 'es');
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  });
}

function MetricRow({ metric, maximum }: { metric: VisualMetric; maximum: number }) {
  const fraction = maximum > 0 ? Math.max(0, metric.value) / maximum : 0;
  const visualWidth = String(Math.min(100, fraction * 100)) + '%';

  return (
    <li className={styles.row}>
      <div className={styles['row-top']}>
        <span className={styles['row-label']}>
          {OCCUPATION_LABELS[metric.occupationCode ?? ''] ?? metric.label}
        </span>
        <strong className={styles.value}>{formatValue(metric.value, metric.kind)}</strong>
      </div>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: visualWidth }} />
      </div>
    </li>
  );
}

function MetricCard({
  kind,
  heading,
  explanation,
  metrics,
}: {
  kind: VisualMetricKind;
  heading: string;
  explanation: string;
  metrics: VisualMetric[] | null;
}) {
  if (metrics === null) {
    return (
      <article className={styles.card}>
        <h4>{heading}</h4>
        <p>La evidencia no es comparable o todavía no está disponible.</p>
      </article>
    );
  }

  const main = metrics.filter((metric) =>
    FOCUS_OCCUPATIONS.includes(metric.occupationCode as (typeof FOCUS_OCCUPATIONS)[number]),
  );
  const rest = metrics.filter(
    (metric) =>
      !FOCUS_OCCUPATIONS.includes(metric.occupationCode as (typeof FOCUS_OCCUPATIONS)[number]),
  );
  const maximum = Math.max(0, ...metrics.map((metric) => metric.value));

  return (
    <article className={styles.card}>
      <h4>{heading}</h4>
      <p className={styles.explanation}>{explanation}</p>
      <ul className={styles.rows}>
        {main.map((metric) => (
          <MetricRow metric={metric} maximum={maximum} key={metric.id} />
        ))}
      </ul>
      <details className={styles.more}>
        <summary>Comparar las otras cinco ocupaciones</summary>
        <ul className={styles.rows}>
          {rest.map((metric) => (
            <MetricRow metric={metric} maximum={maximum} key={metric.id} />
          ))}
        </ul>
      </details>
      {kind === 'NET_NEW_JOBS' ? (
        <p className={styles['fine-print']}>
          Diferencia calculada a partir de cifras BLS redondeadas en miles.
        </p>
      ) : null}
    </article>
  );
}

export function ProfessionalMarketCharts({ data }: { data: ProfessionalVisualizationData }) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.unavailable} aria-label="Gráficos comparativos de mercado">
        {data.notice ?? 'Esta comparación no está disponible por el momento.'}
      </section>
    );
  }

  const source = data.snapshot.sources.find((item) => item.id === 'LM-SRC-001');
  const growthPanel = data.snapshot.panels.find((panel) => panel.id === 'V02');
  const openingsPanel = data.snapshot.panels.find((panel) => panel.id === 'V03');

  if (!source || source.kind !== 'OFFICIAL_STATISTICS') return null;

  return (
    <section className={styles.section} aria-labelledby="professional-comparison-title">
      <div className={styles.heading}>
        <p className={styles.kicker}>Comparador de ocupaciones · proyecciones oficiales</p>
        <h2 id="professional-comparison-title">
          Crecer más rápido no siempre significa más oportunidades
        </h2>
        <p>
          Las mismas ocho ocupaciones, vistas desde tres ángulos. Empleo en EE. UU. durante
          2025–2035; no son vacantes argentinas ni predicciones sobre qué puestos reemplazará la IA.
        </p>
      </div>
      {data.notice ? (
        <p className={styles.warning} role="status">
          {data.notice}
        </p>
      ) : null}
      <div className={styles.cards}>
        {METRICS.map((metric) => (
          <MetricCard
            key={metric.kind}
            {...metric}
            metrics={metricRows(
              metric.kind === 'ANNUAL_OPENINGS' ? openingsPanel : growthPanel,
              metric.kind,
            )}
          />
        ))}
      </div>
      <p className={styles.provenance}>
        <strong>Fuente:</strong>{' '}
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.label}
        </a>{' '}
        · 2025–2035 · consultada el {source.observedAt} · referencia internacional (EE. UU.) · PAS{' '}
        <code>{data.snapshot.source.commit.slice(0, 8)}</code>.
      </p>
    </section>
  );
}
