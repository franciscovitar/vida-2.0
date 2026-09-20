/**
 * Secciones de lectura de Health Intelligence V1.
 *
 * Presentación pura: todo el razonamiento vive en `lib/health/intelligence.ts`.
 * El detalle métrico y el historial siguen debajo, como evidencia auditable.
 */
import {
  Activity,
  Dumbbell,
  Gauge,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { PersonalDeviationRadar } from '@/lib/health/deviation-radar';
import type {
  HealthCrossDomainContext,
  HealthCurrentState,
  HealthDailyBrief,
  HealthEvidenceQuality,
  HealthPriority,
  HealthTrajectory,
  HealthTrajectoryItem,
} from '@/lib/health/intelligence';
import type { RhythmFeaturesViewModel } from '@/lib/health/rhythm-features-sheet';
import type { HealthExplainableScore, HealthScoreboard } from '@/lib/health/scores';

import styles from './HealthIntelligenceSections.module.scss';

function TrendIcon({ direction }: { direction: HealthTrajectoryItem['direction'] }) {
  if (direction === 'up') return <TrendingUp size={14} aria-hidden="true" />;
  if (direction === 'down') return <TrendingDown size={14} aria-hidden="true" />;
  return <Minus size={14} aria-hidden="true" />;
}

const SCORE_BAND_LABELS: Readonly<Record<HealthExplainableScore['band'], string>> = {
  strong: 'Fuerte',
  good: 'Bien',
  'below-usual': 'Bajo tu rango',
  low: 'Bajo',
  insufficient: 'Sin evidencia',
};

const SCORE_EVIDENCE_LABELS: Readonly<Record<HealthExplainableScore['evidenceStrength'], string>> =
  {
    strong: 'Alta',
    moderate: 'Moderada',
    limited: 'Limitada',
  };

const SCORE_CONFIDENCE_LABELS: Readonly<Record<HealthExplainableScore['confidenceBand'], string>> =
  {
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
  };

const RHYTHM_BAND_LABELS = {
  'very-stable': 'Muy estable',
  stable: 'Estable',
  variable: 'Variable',
  irregular: 'Irregular',
  insufficient: 'Sin evidencia',
} as const;

const RHYTHM_STATE_LABELS: Readonly<Record<RhythmFeaturesViewModel['state'], string>> = {
  ready: 'Disponible',
  insufficient: 'Sin evidencia suficiente',
  empty: 'Sin historial',
  unavailable: 'No disponible',
  error: 'Error de lectura',
};

function ScoreValue({ score }: { score: number | null }) {
  return score === null ? <span aria-label="Sin score">—</span> : <>{score}</>;
}

function ScoreTrend({ score }: { score: HealthExplainableScore }) {
  if (score.trend === 'up') {
    return <TrendingUp size={13} aria-label="Tendencia favorable" />;
  }
  if (score.trend === 'down') {
    return <TrendingDown size={13} aria-label="Tendencia desfavorable" />;
  }
  if (score.trend === 'stable') {
    return <Minus size={13} aria-label="Tendencia estable" />;
  }
  return null;
}

function RhythmStabilityCard({ rhythm }: { rhythm: RhythmFeaturesViewModel }) {
  const result = rhythm.result;
  const bandLabel = result ? RHYTHM_BAND_LABELS[result.band] : RHYTHM_STATE_LABELS[rhythm.state];
  const visualBand =
    result?.band === 'variable' || result?.band === 'irregular'
      ? 'below-usual'
      : result?.band === 'insufficient' || !result
        ? 'insufficient'
        : 'good';

  return (
    <article
      className={styles['domain-score-card']}
      data-band={visualBand}
      data-rhythm-state={rhythm.state}
    >
      <div className={styles['domain-score-top']}>
        <div>
          <span>Rhythm Stability</span>
          <small>{bandLabel}</small>
        </div>
      </div>

      <div className={`${styles['domain-score-value']} tabular`}>
        <ScoreValue score={result?.score ?? null} />
        {result?.score === null || result?.score === undefined ? null : <small>/100</small>}
      </div>

      <p>
        {result
          ? result.question
          : rhythm.state === 'empty'
            ? 'Todavía no hay historial normalizado suficiente para calcular estabilidad.'
            : 'La estabilidad de ritmo no puede calcularse con la evidencia disponible.'}
      </p>
      <p>{result?.personalPosition ?? rhythm.notice ?? 'Sin evidencia suficiente para puntuar.'}</p>

      {result ? (
        <>
          <div className={styles['domain-score-confidence']}>
            <span>Confianza</span>
            <strong className="tabular">{result.confidence}%</strong>
          </div>
          <div className={styles['domain-score-confidence']}>
            <span>Noches válidas</span>
            <strong className="tabular">{result.validSleepNights}</strong>
          </div>
          <div className={styles['domain-score-confidence']}>
            <span>Días de actividad válidos</span>
            <strong className="tabular">{result.validActivityDays}</strong>
          </div>

          <details className={styles['score-details']}>
            <summary>Ver cálculo</summary>
            <ul>
              {result.contributors.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.score === null ? 'No disponible' : `${item.score}/100`}</strong>
                  <small>{item.detail}</small>
                </li>
              ))}
            </ul>
            {result.uncertainties.length > 0 ? (
              <div className={styles['score-uncertainties']}>
                {result.uncertainties.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ) : null}
          </details>
        </>
      ) : null}

      <p>Consistencia personal; no mide riesgo clínico.</p>
    </article>
  );
}

export function HealthDeviationRadarSection({
  radar,
}: {
  radar: PersonalDeviationRadar;
}) {
  const levelLabel =
    radar.level === 'usual'
      ? 'Habitual'
      : radar.level === 'mild'
        ? 'Cambio leve'
        : radar.level === 'moderate'
          ? 'Cambio moderado'
          : radar.level === 'marked'
            ? 'Cambio marcado'
            : 'Sin evidencia suficiente';

  return (
    <Card aria-labelledby="health-deviation-radar-title">
      <SectionHeader
        id="health-deviation-radar-title"
        title="Personal Deviation Radar"
        description="Busca cambios simultáneos respecto de tu propio patrón. No es otro score."
        domain="health"
      />

      <div className={styles['radar-summary']} data-level={radar.level}>
        <div>
          <p className={styles.eyebrow}>Lectura multiseñal</p>
          <h3>{radar.headline}</h3>
          <p>{radar.detail}</p>
        </div>
        <span>{levelLabel}</span>
      </div>

      {radar.clusters.length > 0 ? (
        <div className={styles['radar-grid']}>
          {radar.clusters.map((cluster) => (
            <article
              key={cluster.id}
              className={styles['radar-card']}
              data-state={cluster.state}
              data-direction={cluster.direction}
            >
              <div className={styles['radar-card-head']}>
                <strong>{cluster.label}</strong>
                <span>
                  {cluster.state === 'shifted'
                    ? 'Desviado'
                    : cluster.state === 'mild'
                      ? 'Leve'
                      : cluster.state === 'usual'
                        ? 'Habitual'
                        : 'Sin evidencia'}
                </span>
              </div>
              <p>{cluster.detail}</p>
              <ul>
                {cluster.signals.map((signal) => (
                  <li key={signal.id} data-state={signal.state}>
                    <span>{signal.label}</span>
                    <small>{signal.detail}</small>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : null}

      <p className={styles.caveat}>{radar.caveat}</p>
    </Card>
  );
}

/** Health Intelligence V1.1 — significado primero, evidencia debajo. */
export function HealthScoreboardSection({
  scoreboard,
  rhythm,
}: {
  scoreboard: HealthScoreboard;
  rhythm: RhythmFeaturesViewModel;
}) {
  const readiness = scoreboard.readiness;

  return (
    <section className={styles.scoreboard} aria-labelledby="health-scoreboard-title">
      <article
        className={styles['readiness-card']}
        data-band={readiness.band}
        data-confidence={readiness.confidenceBand}
      >
        <div className={styles['readiness-copy']}>
          <p className={styles.eyebrow}>Health Intelligence V1.1</p>
          <div className={styles['readiness-title-row']}>
            <h2 id="health-scoreboard-title">Readiness</h2>
            <span className={styles['score-band']}>{SCORE_BAND_LABELS[readiness.band]}</span>
          </div>
          <p className={styles['readiness-question']}>{readiness.question}</p>
          <p className={styles['readiness-position']}>{readiness.personalPosition}</p>
        </div>

        <div className={styles['readiness-score-wrap']}>
          <div className={`${styles['readiness-score']} tabular`}>
            <ScoreValue score={readiness.score} />
            {readiness.score === null ? null : <small>/100</small>}
          </div>
          <span
            className={styles['score-confidence']}
            data-confidence={readiness.confidenceBand}
            title="Calidad de los datos disponibles hoy; no es probabilidad de estar sano."
          >
            Confianza {readiness.confidence}% · {SCORE_CONFIDENCE_LABELS[readiness.confidenceBand]}
          </span>
          <span className={styles['score-confidence']} title={readiness.evidenceSummary}>
            Evidencia científica {SCORE_EVIDENCE_LABELS[readiness.evidenceStrength]}
          </span>
        </div>

        <div className={styles['readiness-why']}>
          <p>Por qué</p>
          <ul>
            {readiness.contributors.map((item) => (
              <li key={item.id} data-direction={item.direction}>
                <span>{item.label}</span>
                <strong className="tabular">{item.score === null ? '?' : item.score}</strong>
                <small>{item.detail}</small>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles['score-caveat']}>
          Score de bienestar/readiness, no diagnóstico. Si falta evidencia, baja la confianza o no
          se muestra un número.
        </p>
      </article>

      <div className={styles['domain-score-grid']}>
        {scoreboard.domains.map((score) => (
          <article key={score.id} className={styles['domain-score-card']} data-band={score.band}>
            <div className={styles['domain-score-top']}>
              <div>
                <span>{score.label}</span>
                <small>{SCORE_BAND_LABELS[score.band]}</small>
              </div>
              <span className={styles['domain-score-trend']}>
                <ScoreTrend score={score} />
              </span>
            </div>
            <div className={`${styles['domain-score-value']} tabular`}>
              <ScoreValue score={score.score} />
              {score.score === null ? null : <small>/100</small>}
            </div>
            <p>{score.personalPosition}</p>
            <div className={styles['domain-score-confidence']}>
              <span>Confianza</span>
              <strong className="tabular">{score.confidence}%</strong>
            </div>
            <div className={styles['domain-score-confidence']} title={score.evidenceSummary}>
              <span>Evidencia científica</span>
              <strong>{SCORE_EVIDENCE_LABELS[score.evidenceStrength]}</strong>
            </div>
            <details className={styles['score-details']}>
              <summary>Ver cálculo</summary>
              <ul>
                {score.contributors.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <strong>{item.score === null ? 'No disponible' : `${item.score}/100`}</strong>
                    <small>{item.detail}</small>
                  </li>
                ))}
              </ul>
              {score.uncertainties.length > 0 ? (
                <div className={styles['score-uncertainties']}>
                  {score.uncertainties.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              ) : null}
            </details>
          </article>
        ))}
      </div>

      <RhythmStabilityCard rhythm={rhythm} />

      <article className={styles['momentum-card']} data-direction={scoreboard.momentum.direction}>
        <div>
          <span>Health Momentum</span>
          <strong>
            {scoreboard.momentum.direction === 'improving'
              ? 'Mejorando'
              : scoreboard.momentum.direction === 'declining'
                ? 'Bajando'
                : scoreboard.momentum.direction === 'stable'
                  ? 'Estable'
                  : 'Sin evidencia'}
          </strong>
        </div>
        <div className="tabular">
          {scoreboard.momentum.score === null ? '—' : scoreboard.momentum.score}
          {scoreboard.momentum.score === null ? null : <small>/100</small>}
        </div>
        <p>{scoreboard.momentum.detail}</p>
        <span className={styles['momentum-confidence']}>
          Confianza {scoreboard.momentum.confidence}%
        </span>
      </article>
    </section>
  );
}

/** 1. ¿Cómo estoy hoy? */
export function HealthTodayHero({
  brief,
  state,
  quality,
}: {
  brief: HealthDailyBrief;
  state: HealthCurrentState;
  quality: HealthEvidenceQuality;
}) {
  const signals = state.evidence.filter((item) => item.role === 'core' && item.value !== null);

  return (
    <section className={styles.hero} aria-labelledby="health-today-title" data-state={state.kind}>
      <div className={styles['hero-copy']}>
        <div className={styles['brief-meta']}>
          <p className={styles.eyebrow}>Resumen diario de salud</p>
          <span className={styles['brief-state']} data-state={brief.state}>
            {brief.state}
          </span>
          <span className={styles['brief-confidence']}>Confianza {brief.confidence}</span>
        </div>
        <h2 id="health-today-title" className={styles['hero-title']}>
          {state.headline}
        </h2>
        <p className={styles.explanation}>{state.explanation}</p>

        <p className={styles.coverage} data-level={quality.level}>
          <Gauge size={13} aria-hidden="true" />
          <span>
            <strong>{quality.label}</strong> · {quality.detail}
          </span>
        </p>

        {state.lastInterpretable ? (
          <p className={styles.historical}>
            <Activity size={13} aria-hidden="true" />
            <span>{state.lastInterpretable.summary}</span>
          </p>
        ) : null}
      </div>

      <div className={styles['hero-signals']}>
        <p className={styles['signals-title']}>Señales núcleo de hoy</p>
        {signals.length === 0 ? (
          <p className={styles['signals-empty']}>
            {state.coreMissing.length > 0
              ? `Sin registro hoy de ${state.coreMissing.join(' ni ')}.`
              : 'Todavía no hay señales núcleo registradas hoy.'}
          </p>
        ) : (
          <ul className={styles['signal-list']}>
            {signals.map((item) => (
              <li
                key={item.signal}
                className={styles.signal}
                data-materiality={item.materiality}
                data-concern={item.concern ? 'yes' : 'no'}
              >
                <span className={styles['signal-label']}>{item.label}</span>
                <strong className={`${styles['signal-value']} tabular`}>{item.valueLabel}</strong>
                <small className={styles['signal-base']}>base {item.baselineLabel}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 2. ¿Cómo vengo? */
export function HealthTrajectorySection({ trajectory }: { trajectory: HealthTrajectory }) {
  return (
    <Card aria-labelledby="health-trajectory-title">
      <SectionHeader
        id="health-trajectory-title"
        title="Cómo venís"
        description={`${trajectory.headline} ${trajectory.detail}`}
        domain="health"
      />
      <div className={styles['trajectory-grid']}>
        {trajectory.items.map((item) => (
          <article key={item.id} className={styles['trajectory-card']} data-tone={item.tone}>
            <div className={styles['trajectory-top']}>
              <span>{item.label}</span>
              <span className={styles['trajectory-dir']} data-dir={item.direction}>
                <TrendIcon direction={item.direction} />
              </span>
            </div>
            <p className={`${styles['trajectory-value']} tabular`}>{item.currentLabel}</p>
            <p className={styles['trajectory-summary']}>{item.summary}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

/** 4. ¿Qué contexto puede estar relacionado? */
export function HealthContextSection({ context }: { context: HealthCrossDomainContext }) {
  const cards = [
    { id: 'gym', icon: Dumbbell, title: 'Gimnasio', data: context.gym },
    { id: 'nutrition', icon: UtensilsCrossed, title: 'Nutrición', data: context.nutrition },
  ] as const;

  return (
    <Card aria-labelledby="health-context-title">
      <SectionHeader
        id="health-context-title"
        title="Contexto"
        description="Lectura de solo lectura de otros dominios, para ubicar el período. Nunca se presenta como causa."
        domain="health"
      />
      <div className={styles['context-grid']}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.id} className={styles['context-card']} data-state={card.data.state}>
              <header className={styles['context-head']}>
                <span className={styles['context-icon']} aria-hidden="true">
                  <Icon size={15} />
                </span>
                <span>{card.title}</span>
              </header>
              <strong className={styles['context-headline']}>{card.data.headline}</strong>
              <p className={styles['context-detail']}>{card.data.detail}</p>
            </article>
          );
        })}
      </div>
      <p className={styles.caveat}>{context.caveat}</p>
    </Card>
  );
}

/** 5. ¿Qué merece mi atención ahora? */
export function HealthPrioritiesSection({ priorities }: { priorities: readonly HealthPriority[] }) {
  return (
    <Card aria-labelledby="health-priorities-title">
      <SectionHeader
        id="health-priorities-title"
        title="Qué mejorar ahora"
        description="Como máximo tres prioridades, cada una con el dato observado que la habilita. No son indicaciones médicas."
        domain="health"
        icon={Target}
      />
      <ol className={styles['priority-list']}>
        {priorities.map((priority, index) => (
          <li key={priority.id} className={styles.priority} data-tone={priority.tone}>
            <span className={styles['priority-rank']} aria-hidden="true">
              {index + 1}
            </span>
            <div className={styles['priority-body']}>
              <h3>{priority.title}</h3>
              <p>{priority.detail}</p>
              <p className={styles['priority-evidence']}>{priority.evidence}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
