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
import type {
  HealthCrossDomainContext,
  HealthCurrentState,
  HealthEvidenceQuality,
  HealthPriority,
  HealthTrajectory,
  HealthTrajectoryItem,
} from '@/lib/health/intelligence';

import styles from './HealthIntelligenceSections.module.scss';

function TrendIcon({ direction }: { direction: HealthTrajectoryItem['direction'] }) {
  if (direction === 'up') return <TrendingUp size={14} aria-hidden="true" />;
  if (direction === 'down') return <TrendingDown size={14} aria-hidden="true" />;
  return <Minus size={14} aria-hidden="true" />;
}

/** 1. ¿Cómo estoy hoy? */
export function HealthTodayHero({
  state,
  quality,
}: {
  state: HealthCurrentState;
  quality: HealthEvidenceQuality;
}) {
  const signals = state.evidence.filter((item) => item.role === 'core' && item.value !== null);

  return (
    <section className={styles.hero} aria-labelledby="health-today-title" data-state={state.kind}>
      <div className={styles['hero-copy']}>
        <p className={styles.eyebrow}>Cómo estás hoy</p>
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
