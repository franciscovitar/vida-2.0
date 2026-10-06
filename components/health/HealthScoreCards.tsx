import { Activity, Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { PersonalDeviationRadar } from '@/lib/health/deviation-radar';
import type { RhythmFeaturesViewModel } from '@/lib/health/rhythm-features-sheet';
import type {
  HealthExplainableScore,
  HealthMomentum,
} from '@/lib/health/scores';

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
              {momentum.score === null ? momentum.detail : `${momentum.score}/100 · confianza ${momentum.confidence}%`}
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
