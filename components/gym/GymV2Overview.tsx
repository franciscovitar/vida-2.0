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

type ShareStyle = CSSProperties & {
  '--share': string;
};

type SparkPoint = {
  x: number;
  y: number;
};

function number(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);
}

function trendLabel(trend: GymV2Trend, delta: number | null): string {
  if (delta === null || trend === 'unknown') return 'Sin comparación';
  if (trend === 'steady') return 'Estable';
  return `${delta > 0 ? '+' : ''}${number(delta)}%`;
}

function trendAriaLabel(trend: GymV2Trend, delta: number | null): string {
  const label = trendLabel(trend, delta);
  return label === 'Sin comparación' ? label : `${label} frente a la sesión anterior`;
}

function baselineLabel(delta: number | null): string {
  if (delta === null) return 'Sin base suficiente';
  if (Math.abs(delta) <= 2) return 'En línea con tu base';
  return `${number(Math.abs(delta))}% ${delta > 0 ? 'sobre' : 'debajo de'} tu base`;
}

function shortDate(ymd: string | null): string {
  if (!ymd) return '—';
  const [, month, day] = ymd.split('-');
  return `${day}/${month}`;
}

function sparkPoints(series: readonly number[]): SparkPoint[] {
  const values = series.slice(-5);
  if (values.length === 0) return [];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;

  return values.map((value, index) => ({
    x: values.length === 1 ? 50 : 4 + (index / (values.length - 1)) * 92,
    y: range === 0 ? 16 : 28 - ((value - minimum) / range) * 24,
  }));
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
  const totalMuscleSets = analytics.muscleGroups.reduce(
    (total, group) => total + group.completedSets,
    0,
  );
  const topMuscleGroup = analytics.muscleGroups.at(0) ?? null;

  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-labelledby="gym-v2-title">
        <div className={styles['hero-copy']}>
          <p className={styles.eyebrow}>Gimnasio V2 · progreso real</p>
          <h2 id="gym-v2-title">Tu progreso, comparado con vos</h2>
          <p>
            Tu historial convertido en señales simples de frecuencia y rendimiento. Cada tendencia
            compara el mismo ejercicio entre sesiones equivalentes.
          </p>
        </div>

        <div className={styles['status-pill']} data-tone={statusTone}>
          <Activity size={19} aria-hidden="true" />
          <span>
            <small>Estado reciente</small>
            <strong>{analytics.statusLabel}</strong>
            <span>{analytics.statusDetail}</span>
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
                  ? 'sesión registrada esta semana'
                  : `${analytics.adherencePercent}% de tu frecuencia objetivo`}
              </small>
            </div>
          </article>

          <article className={styles['comparison-item']} data-tone={deltaTone}>
            <span className={styles['comparison-icon']} aria-hidden="true">
              {analytics.weeklyDelta < 0 ? <TrendingDown size={17} /> : <TrendingUp size={17} />}
            </span>
            <div>
              <span>Ritmo semanal</span>
              <strong className="tabular">
                {analytics.currentWeekSessions} vs {analytics.previousWeekSessions}
              </strong>
              <small>misma altura de la semana anterior</small>
            </div>
          </article>

          <article className={styles['comparison-item']}>
            <span className={styles['comparison-icon']} aria-hidden="true">
              <BarChart3 size={17} />
            </span>
            <div>
              <span>Tu base reciente</span>
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
        </div>
      </section>

      <Card aria-labelledby="gym-v2-insights-title">
        <SectionHeader
          id="gym-v2-insights-title"
          title="Qué cambió"
          description="Las tres señales más útiles de tus últimos registros."
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
          description="Mejor set de cada sesión. La línea muestra la tendencia estimada dentro del mismo ejercicio."
          domain="health"
        />
        {exerciseCards.length === 0 ? (
          <p className={styles.empty}>
            Todavía no hay sesiones completas suficientes para construir progreso por ejercicio.
          </p>
        ) : (
          <div className={styles['exercise-grid']}>
            {exerciseCards.map((exercise) => {
              const points = sparkPoints(exercise.series);
              const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
              return (
                <article key={exercise.key} className={styles.exercise} data-trend={exercise.trend}>
                  <div className={styles['exercise-heading']}>
                    <div>
                      <span>Último · {shortDate(exercise.latestDate)}</span>
                      <h3>{exercise.exerciseName}</h3>
                    </div>
                    <span
                      className={styles['trend-chip']}
                      data-trend={exercise.trend}
                      aria-label={trendAriaLabel(exercise.trend, exercise.deltaPercent)}
                    >
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

                  <div className={styles.spark}>
                    {points.length > 0 ? (
                      <svg
                        viewBox="0 0 100 32"
                        role="img"
                        aria-label={`Tendencia estimada de ${exercise.exerciseName} en ${exercise.sessionCount} sesiones`}
                      >
                        <polyline className={styles['spark-line']} points={polyline} />
                        {points.map((point, index) => (
                          <circle
                            key={`${exercise.key}-${index}`}
                            className={styles['spark-dot']}
                            cx={point.x}
                            cy={point.y}
                            r="2.2"
                          />
                        ))}
                      </svg>
                    ) : null}
                  </div>

                  <div className={styles['exercise-footer']}>
                    <span>{exercise.sessionCount} sesiones</span>
                    <span>{exercise.completedSets} series</span>
                    <span>
                      Mejor carga {exercise.bestLoad === null ? '—' : `${number(exercise.bestLoad)} kg`}
                    </span>
                  </div>
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
          description="Distribución descriptiva de las series registradas en los últimos 28 días."
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
                  <small>{group.sharePercent}% del total registrado</small>
                </article>
              ))}
            </div>

            <aside className={styles['focus-summary']}>
              <span>Últimos 28 días</span>
              <strong className="tabular">{totalMuscleSets} series</strong>
              <div>
                <small>Mayor foco</small>
                <b>{topMuscleGroup?.label ?? '—'}</b>
                <span>
                  {topMuscleGroup
                    ? `${topMuscleGroup.sharePercent}% de las series registradas`
                    : 'sin datos suficientes'}
                </span>
              </div>
              <small>
                Cobertura del agrupado:{' '}
                {analytics.muscleCoveragePercent === null
                  ? 'sin datos'
                  : `${analytics.muscleCoveragePercent}%`}
              </small>
            </aside>
          </div>
        )}
      </Card>

      <aside className={styles['benchmark-strip']}>
        <Gauge size={19} aria-hidden="true" />
        <div>
          <strong>Comparación externa, separada de tu progreso personal</strong>
          <p>{analytics.benchmark.detail}</p>
        </div>
      </aside>
    </div>
  );
}
