import {
  Activity,
  BarChart3,
  Gauge,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { CSSProperties } from 'react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { computeGymV2Analytics, type GymV2Trend } from '@/lib/gym/v2-analytics';
import type { GymSession, GymSessionSummary } from '@/types/gym';

import styles from './GymV2Overview.module.scss';

type BarStyle = CSSProperties & {
  '--bar-height': string;
};

type ShareStyle = CSSProperties & {
  '--share': string;
};

function number(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);
}

function signed(value: number): string {
  if (value > 0) return `+${number(value)}`;
  return number(value);
}

function trendLabel(trend: GymV2Trend, delta: number | null): string {
  if (delta === null || trend === 'unknown') return 'Sin comparación';
  if (trend === 'steady') return 'Estable vs anterior';
  return `${delta > 0 ? '+' : ''}${number(delta)}% vs anterior`;
}

function baselineLabel(delta: number | null): string {
  if (delta === null) return 'Sin base suficiente';
  if (Math.abs(delta) <= 2) return 'En línea con tu base';
  return `${delta > 0 ? '+' : ''}${number(delta)}% vs tu base`;
}

function shortDate(ymd: string | null): string {
  if (!ymd) return '—';
  const [, month, day] = ymd.split('-');
  return `${day}/${month}`;
}

function sparkHeight(value: number, maximum: number): string {
  if (maximum <= 0 || value <= 0) return '4%';
  return `${Math.max(12, Math.round((value / maximum) * 100))}%`;
}

export function GymV2Overview({
  sessions,
  summaries,
  weeklyTarget,
  today,
}: {
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  weeklyTarget: number | null;
  today: string;
}) {
  const analytics = computeGymV2Analytics({ sessions, summaries, weeklyTarget, today });
  const statusTone =
    analytics.statusLabel === 'Progresando'
      ? 'positive'
      : analytics.statusLabel === 'Tendencia mixta'
        ? 'watch'
        : 'neutral';
  const deltaTone =
    analytics.weeklyDelta > 0 ? 'positive' : analytics.weeklyDelta < 0 ? 'watch' : 'neutral';
  const exerciseCards = analytics.exerciseTrends.slice(0, 6);
  const maxMuscleSets = Math.max(...analytics.muscleGroups.map((group) => group.completedSets), 1);

  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-labelledby="gym-v2-title">
        <div className={styles['hero-copy']}>
          <p className={styles.eyebrow}>Gimnasio V2</p>
          <h2 id="gym-v2-title">Tu progreso, comparado con vos</h2>
          <p>
            Primero rendimiento personal y consistencia. Las referencias externas se muestran aparte
            y solo cuando exista una comparación realmente compatible.
          </p>
        </div>

        <div className={styles['status-pill']} data-tone={statusTone}>
          <Activity size={18} aria-hidden="true" />
          <span>
            <strong>{analytics.statusLabel}</strong>
            <small>{analytics.statusDetail}</small>
          </span>
        </div>

        <div className={styles['comparison-grid']}>
          <article className={styles['comparison-item']}>
            <span className={styles['comparison-icon']} aria-hidden="true">
              <Target size={17} />
            </span>
            <div>
              <span>Esta semana</span>
              <strong className="tabular">
                {analytics.currentWeekSessions}
                {analytics.weeklyTarget ? `/${analytics.weeklyTarget}` : ''}
              </strong>
              <small>
                {analytics.adherencePercent === null
                  ? 'sesiones registradas'
                  : `${analytics.adherencePercent}% de la frecuencia objetivo`}
              </small>
            </div>
          </article>

          <article className={styles['comparison-item']} data-tone={deltaTone}>
            <span className={styles['comparison-icon']} aria-hidden="true">
              {analytics.weeklyDelta < 0 ? <TrendingDown size={17} /> : <TrendingUp size={17} />}
            </span>
            <div>
              <span>Vs semana anterior</span>
              <strong className="tabular">{signed(analytics.weeklyDelta)}</strong>
              <small>
                {analytics.previousWeekSessions} sesión(es) a esta altura de la semana anterior
              </small>
            </div>
          </article>

          <article className={styles['comparison-item']}>
            <span className={styles['comparison-icon']} aria-hidden="true">
              <BarChart3 size={17} />
            </span>
            <div>
              <span>Vs tu base reciente</span>
              <strong className="tabular">
                {analytics.baselineComparableExercises === 0
                  ? '—'
                  : `${analytics.aboveBaselineExercises}/${analytics.baselineComparableExercises}`}
              </strong>
              <small>
                {analytics.baselineComparableExercises === 0
                  ? 'todavía sin base suficiente'
                  : 'ejercicios claramente por encima de su base'}
              </small>
            </div>
          </article>

          <article className={styles['comparison-item']} data-tone="benchmark">
            <span className={styles['comparison-icon']} aria-hidden="true">
              <Gauge size={17} />
            </span>
            <div>
              <span>Nivel gimnasio</span>
              <strong>{analytics.benchmark.label}</strong>
              <small>sin inventar un nivel por cargas no comparables</small>
            </div>
          </article>
        </div>
      </section>

      <Card aria-labelledby="gym-v2-insights-title">
        <SectionHeader
          id="gym-v2-insights-title"
          title="Qué cambió"
          description="Hechos derivados del registro. Las variaciones no se presentan como causas."
          domain="health"
        />
        <div className={styles['insight-grid']}>
          {analytics.insights.map((insight) => (
            <article key={insight.id} className={styles.insight} data-tone={insight.tone}>
              <span className={styles['insight-icon']} aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div>
                <h3>{insight.title}</h3>
                <p>{insight.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card aria-labelledby="gym-v2-exercises-title">
        <SectionHeader
          id="gym-v2-exercises-title"
          title="Ejercicios principales"
          description="El set real queda visible; la tendencia usa e1RM como índice personal para comparar carga y repeticiones del mismo ejercicio."
          domain="health"
        />
        {exerciseCards.length === 0 ? (
          <p className={styles.empty}>
            Todavía no hay sesiones completas suficientes para construir progreso por ejercicio.
          </p>
        ) : (
          <div className={styles['exercise-grid']}>
            {exerciseCards.map((exercise) => {
              const maximum = Math.max(...exercise.series, 1);
              return (
                <article key={exercise.key} className={styles.exercise} data-trend={exercise.trend}>
                  <div className={styles['exercise-heading']}>
                    <div>
                      <span>Último · {shortDate(exercise.latestDate)}</span>
                      <h3>{exercise.exerciseName}</h3>
                    </div>
                    <span className={styles['trend-chip']} data-trend={exercise.trend}>
                      {trendLabel(exercise.trend, exercise.deltaPercent)}
                    </span>
                  </div>

                  <div className={styles['exercise-main']}>
                    <strong className="tabular">
                      {exercise.latestLoad === null || exercise.latestReps === null
                        ? 'Sin set comparable'
                        : `${number(exercise.latestLoad)} kg × ${exercise.latestReps}`}
                    </strong>
                    <small>{baselineLabel(exercise.baselineDeltaPercent)}</small>
                  </div>

                  <div
                    className={styles.spark}
                    aria-label={`Evolución de ${exercise.exerciseName}`}
                  >
                    {exercise.series.map((value, index) => (
                      <span
                        key={`${exercise.key}-${index}`}
                        className={styles['spark-bar']}
                        style={{ '--bar-height': sparkHeight(value, maximum) } as BarStyle}
                        aria-hidden="true"
                      />
                    ))}
                  </div>

                  <dl className={styles['exercise-meta']}>
                    <div>
                      <dt>Mejor carga</dt>
                      <dd>
                        {exercise.bestLoad === null ? '—' : `${number(exercise.bestLoad)} kg`}
                      </dd>
                    </div>
                    <div>
                      <dt>Sesiones</dt>
                      <dd>{exercise.sessionCount}</dd>
                    </div>
                    <div>
                      <dt>Series</dt>
                      <dd>{exercise.completedSets}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <Card aria-labelledby="gym-v2-distribution-title">
        <SectionHeader
          id="gym-v2-distribution-title"
          title="Dónde estás poniendo el trabajo"
          description="Distribución de series registradas en los últimos 28 días. Es descripción, no una prescripción de volumen ideal."
          domain="health"
        />
        {analytics.muscleGroups.length === 0 ? (
          <p className={styles.empty}>Sin series recientes para agrupar.</p>
        ) : (
          <div className={styles['muscle-layout']}>
            <div className={styles['muscle-list']}>
              {analytics.muscleGroups.map((group) => (
                <article key={group.id} className={styles['muscle-row']}>
                  <div className={styles['muscle-label']}>
                    <span>{group.label}</span>
                    <strong className="tabular">{group.completedSets} series</strong>
                  </div>
                  <div className={styles['muscle-track']} aria-hidden="true">
                    <span
                      className={styles['muscle-fill']}
                      style={
                        {
                          '--share': `${Math.max(4, Math.round((group.completedSets / maxMuscleSets) * 100))}%`,
                        } as ShareStyle
                      }
                    />
                  </div>
                  <small>{group.sharePercent}% de las series registradas</small>
                </article>
              ))}
            </div>

            <aside className={styles['benchmark-note']}>
              <Gauge size={20} aria-hidden="true" />
              <div>
                <strong>{analytics.benchmark.label}</strong>
                <p>{analytics.benchmark.detail}</p>
                <small>
                  Cobertura del agrupado muscular:{' '}
                  {analytics.muscleCoveragePercent === null
                    ? 'sin datos'
                    : `${analytics.muscleCoveragePercent}%`}
                </small>
              </div>
            </aside>
          </div>
        )}
      </Card>
    </div>
  );
}
