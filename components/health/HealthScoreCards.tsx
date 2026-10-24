import { Activity, Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { PersonalDeviationRadar } from '@/lib/health/deviation-radar';
import type { RhythmFeaturesViewModel } from '@/lib/health/rhythm-features-sheet';
import type { HealthExplainableScore, HealthMomentum, HealthScoreboard } from '@/lib/health/scores';

import styles from './HealthScoreCards.module.scss';

const BAND_LABELS: Readonly<Record<HealthExplainableScore['band'], string>> = {
  strong: 'Fuerte',
  good: 'Bien',
  'below-usual': 'Bajo tu rango',
  low: 'Bajo',
  insufficient: 'No calculable',
};

function Trend({ score }: { score: HealthExplainableScore }) {
  if (score.trend === 'up') return <TrendingUp size={14} aria-label="Tendencia favorable" />;
  if (score.trend === 'down') return <TrendingDown size={14} aria-label="Tendencia desfavorable" />;
  return <Minus size={14} aria-label="Tendencia estable o no disponible" />;
}

export function HealthReadinessSummary({ score }: { score: HealthExplainableScore }) {
  const available = score.score !== null;

  return (
    <Card compact>
      <div className={styles.readiness} data-band={score.band}>
        <div className={styles['readiness-copy']}>
          <span className={styles.kicker}>Readiness objetivo</span>
          <div className={styles['title-row']}>
            <strong>{available ? BAND_LABELS[score.band] : 'No calculable hoy'}</strong>
            <span>Confianza {score.confidence}%</span>
          </div>
          <p>
            {available
              ? score.personalPosition
              : 'No se fuerza un número: se muestra cuando Sueño y Estabilidad cardio tienen evidencia objetiva suficiente.'}
          </p>
        </div>
        <div className={styles['readiness-value']}>
          {score.score === null ? '—' : score.score}
          {score.score === null ? null : <small>/100</small>}
        </div>
      </div>
      <p className={styles.caveat}>
        Score de bienestar/readiness; no es diagnóstico ni aptitud médica.
      </p>
      <details className={styles.details}>
        <summary>Ver evidencia del Readiness</summary>
        <div className={styles['contributor-grid']}>
          {score.contributors.map((item) => (
            <div key={item.id}>
              <span>{item.label}</span>
              <strong>{item.score === null ? 'No disponible' : `${item.score}/100`}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
        <p>{score.evidenceSummary}</p>
      </details>
    </Card>
  );
}

export function HealthDomainScoreCard({ score }: { score: HealthExplainableScore }) {
  return (
    <Card compact>
      <article className={styles.domain} data-band={score.band}>
        <div className={styles['domain-head']}>
          <div>
            <span>{score.label}</span>
            <small>{BAND_LABELS[score.band]}</small>
          </div>
          <Trend score={score} />
        </div>
        <div className={styles['domain-value']}>
          {score.score === null ? '—' : score.score}
          {score.score === null ? null : <small>/100</small>}
        </div>
        <p>{score.personalPosition}</p>
        <div className={styles.meta}>
          <span>Confianza {score.confidence}%</span>
          <span>Evidencia {score.evidenceStrength}</span>
        </div>
        <p className={styles.caveat}>Score de bienestar/tendencia; no es diagnóstico.</p>
        <details className={styles.details}>
          <summary>Ver cálculo</summary>
          <div className={styles['contributor-grid']}>
            {score.contributors.map((item) => (
              <div key={item.id}>
                <span>{item.label}</span>
                <strong>{item.score === null ? 'No disponible' : `${item.score}/100`}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </details>
      </article>
    </Card>
  );
}

export function HealthRhythmCard({ rhythm }: { rhythm: RhythmFeaturesViewModel }) {
  const result = rhythm.result;
  const available = result?.score !== null && result?.score !== undefined;

  return (
    <Card compact>
      <article className={styles.domain}>
        <div className={styles['domain-head']}>
          <div>
            <span>Regularidad de sueño</span>
            <small>{available ? 'Rhythm Stability' : 'No calculable'}</small>
          </div>
          <Activity size={15} aria-hidden="true" />
        </div>
        <div className={styles['domain-value']}>
          {available ? result?.score : '—'}
          {available ? <small>/100</small> : null}
        </div>
        <p>{result?.personalPosition ?? rhythm.notice ?? 'Sin historial suficiente.'}</p>
        {result ? (
          <>
            <div className={styles.meta}>
              <span>Confianza {result.confidence}%</span>
              <span>{result.validSleepNights} noches válidas</span>
            </div>
            <details className={styles.details}>
              <summary>Ver cálculo</summary>
              <div className={styles['contributor-grid']}>
                {result.contributors.map((item) => (
                  <div key={item.id}>
                    <span>{item.label}</span>
                    <strong>{item.score === null ? 'No disponible' : `${item.score}/100`}</strong>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </div>
            </details>
          </>
        ) : null}
      </article>
    </Card>
  );
}

export function HealthLongitudinalSummary({
  momentum,
  radar,
}: {
  momentum: HealthMomentum;
  radar: PersonalDeviationRadar;
}) {
  return (
    <Card>
      <SectionHeader
        title="Lectura longitudinal"
        description="Cambios respecto de tu propia historia. No es un diagnóstico ni otro estado diario."
        domain="health"
      />
      <div className={styles.longitudinal}>
        <article>
          <Gauge size={17} aria-hidden="true" />
          <div>
            <span>Dirección reciente</span>
            <strong>
              {momentum.direction === 'improving'
                ? 'Mejorando'
                : momentum.direction === 'declining'
                  ? 'Bajando'
                  : momentum.direction === 'stable'
                    ? 'Estable'
                    : 'Sin evidencia suficiente'}
            </strong>
            <small>
              {momentum.score === null
                ? momentum.detail
                : `${momentum.score}/100 · confianza ${momentum.confidence}%`}
            </small>
          </div>
        </article>
        <article>
          <Activity size={17} aria-hidden="true" />
          <div>
            <span>Desvíos multiseñal</span>
            <strong>{radar.headline}</strong>
            <small>{radar.detail}</small>
          </div>
        </article>
      </div>
    </Card>
  );
}

/** Single scan-first view over all existing domain scores, no new score calculation.
 * Readiness stays prominent directly above; this panel surfaces the remaining
 * five domain scores plus Rhythm Stability and longitudinal Momentum.
 */
export function HealthScoresOverview({
  scoreboard,
  rhythm,
}: {
  scoreboard: HealthScoreboard;
  rhythm: RhythmFeaturesViewModel;
}) {
  const overview = [
    ...scoreboard.domains.map((score) => ({
      id: score.id,
      label: score.label,
      value: score.score,
      confidence: score.confidence,
      context: BAND_LABELS[score.band],
    })),
    {
      id: 'rhythm',
      label: 'Regularidad del sueño',
      value: rhythm.result?.score ?? null,
      confidence: rhythm.result?.confidence ?? null,
      context:
        rhythm.result === null
          ? 'Sin noches comparables suficientes'
          : `${rhythm.result.validSleepNights} noches analizadas`,
    },
    {
      id: 'momentum',
      label: 'Evolución',
      value: scoreboard.momentum.score,
      confidence: scoreboard.momentum.confidence,
      context:
        scoreboard.momentum.direction === 'improving'
          ? 'Mejorando'
          : scoreboard.momentum.direction === 'declining'
            ? 'Bajando'
            : scoreboard.momentum.direction === 'stable'
              ? 'Estable'
              : 'Aún sin tendencia',
    },
  ];

  const explanations = [
    {
      id: 'readiness',
      label: 'Readiness',
      detail: 'Preparación estimada combinando sueño y señales cardio.',
    },
    {
      id: 'sleep',
      label: 'Sueño',
      detail: 'Duración y calidad de datos de sueño frente a tu patrón.',
    },
    {
      id: 'recovery',
      label: 'Recuperación',
      detail: 'Sueño y señales cardiovasculares; no mide recuperación muscular.',
    },
    {
      id: 'activity',
      label: 'Actividad',
      detail: 'Movimiento reciente comparado con tu historia.',
    },
    {
      id: 'cardio-stability',
      label: 'Estabilidad cardio',
      detail: 'FC en reposo y VFC si existen suficientes noches comparables.',
    },
    {
      id: 'mobility',
      label: 'Movilidad',
      detail: 'Regularidad de tus métricas al caminar.',
    },
    {
      id: 'rhythm',
      label: 'Regularidad del sueño',
      detail: 'Qué tan constantes son tus horarios de descanso.',
    },
    {
      id: 'momentum',
      label: 'Evolución',
      detail: 'Tendencia general reciente, no un pronóstico médico.',
    },
  ] as const;

  return (
    <Card aria-labelledby="health-all-scores-title">
      <SectionHeader
        id="health-all-scores-title"
        title="Tus scores"
        description="Readiness está destacado arriba. Acá tenés los otros indicadores juntos."
        domain="health"
      />
      <div className={styles['score-overview-grid']}>
        {overview.map((score) => (
          <article key={score.id} className={styles['score-overview-item']}>
            <h3>{score.label}</h3>
            <div className={styles['score-overview-value']}>
              <strong className="tabular">{score.value === null ? '—' : score.value}</strong>
              {score.value !== null ? <small>/100</small> : null}
            </div>
            <span>{score.value === null ? 'No calculable' : score.context}</span>
            {score.value !== null && score.confidence !== null ? (
              <small>Confianza {score.confidence}%</small>
            ) : null}
          </article>
        ))}
      </div>

      <div className={styles['score-overview-legend']}>
        <h3>¿Qué significa cada score?</h3>
        <dl>
          {explanations.map((item) => (
            <div key={item.id}>
              <dt>{item.label}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className={styles['score-overview-caveat']}>
        Son indicadores personales orientativos, no diagnósticos. Un dato faltante no se reemplaza por
        cero. La VFC empieza a pesar en Estabilidad cardio cuando tiene una base previa suficiente.
      </p>
    </Card>
  );
}
