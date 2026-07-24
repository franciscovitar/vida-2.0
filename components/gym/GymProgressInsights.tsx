import type { CSSProperties } from 'react';

import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { computeGymSessionAnalytics } from '@/lib/gym/session-analytics';
import type { GymSession, GymSessionSummary } from '@/types/gym';

import styles from './GymProgressInsights.module.scss';

type BarStyle = CSSProperties & {
  '--bar-height': string;
};

function number(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function barHeight(value: number, maximum: number): string {
  if (maximum <= 0 || value <= 0) return '0%';
  return `${Math.max(4, Math.round((value / maximum) * 100))}%`;
}

export function GymProgressInsights({
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
  const analytics = computeGymSessionAnalytics({
    sessions,
    summaries,
    weeklyTarget,
    today,
    weeks: 8,
  });

  if (analytics.completedSessions === 0) {
    return (
      <Card>
        <SectionHeader
          title="Análisis de entrenamiento"
          description="Aparecerá cuando exista al menos una sesión completa en Gym Sessions."
          domain="health"
        />
        <p className={styles.empty}>
          No se inventan volumen, récords ni tendencias mientras el historial real esté vacío.
        </p>
      </Card>
    );
  }

  const maxSessions = Math.max(...analytics.weekly.map((item) => item.sessions), 1);
  const maxVolume = Math.max(...analytics.weekly.map((item) => item.volumeLoad), 1);
  const heaviest = analytics.exerciseRecords
    .filter((item) => item.bestLoad !== null)
    .sort((a, b) => (b.bestLoad ?? 0) - (a.bestLoad ?? 0))[0];

  return (
    <>
      <Card>
        <SectionHeader
          title="Resumen del historial"
          description="Métricas calculadas únicamente con sesiones marcadas como completas."
          domain="health"
        />
        <div className={styles.metrics}>
          <MetricCard
            label="Sesiones completas"
            value={String(analytics.completedSessions)}
            context={
              analytics.completionRate === null
                ? 'Sin estados comparables.'
                : `${analytics.completionRate}% de las sesiones con estado`
            }
            domain="health"
            status="good"
          />
          <MetricCard
            label="Series registradas"
            value={String(analytics.totalCompletedSets)}
            context="Solo series presentes en Gym Sets."
            domain="health"
            status="good"
          />
          <MetricCard
            label="Volumen confirmado"
            value={number(analytics.totalVolumeLoad)}
            unit="kg·rep"
            context={
              analytics.volumeCoveragePercent === null
                ? 'Sin peso y repeticiones comparables.'
                : `${analytics.volumeCoveragePercent}% de series con peso y reps`
            }
            domain="health"
            status={analytics.volumeCoveragePercent === 100 ? 'good' : 'neutral'}
          />
          <MetricCard
            label="Duración media"
            value={
              analytics.averageDurationMinutes === null
                ? '—'
                : String(analytics.averageDurationMinutes)
            }
            unit={analytics.averageDurationMinutes === null ? undefined : 'min'}
            context={
              analytics.longestSessionMinutes === null
                ? 'Sin duración registrada.'
                : `Máxima: ${analytics.longestSessionMinutes} min`
            }
            domain="health"
            status={analytics.averageDurationMinutes === null ? 'neutral' : 'good'}
          />
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="Últimas 8 semanas"
          description="Frecuencia y volumen real. Los huecos no se convierten en cero histórico."
          domain="health"
        />
        <div className={styles['chart-grid']}>
          <section className={styles.chart} aria-labelledby="gym-frequency-chart">
            <div className={styles['chart-heading']}>
              <h3 id="gym-frequency-chart">Sesiones por semana</h3>
              <span>{weeklyTarget ? `Objetivo: ${weeklyTarget}` : 'Sin objetivo confirmado'}</span>
            </div>
            <div className={styles.bars}>
              {analytics.weekly.map((point) => (
                <div
                  key={`sessions-${point.key}`}
                  className={styles['bar-column']}
                  aria-label={`${point.label}: ${point.sessions} sesiones`}
                >
                  <strong>
                    {point.sessions}
                    {point.adherencePercent !== null ? ` · ${point.adherencePercent}%` : ''}
                  </strong>
                  <div className={styles['bar-track']} aria-hidden="true">
                    <span
                      className={styles['bar-fill']}
                      style={
                        {
                          '--bar-height': barHeight(point.sessions, maxSessions),
                        } as BarStyle
                      }
                    />
                  </div>
                  <span>{point.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.chart} aria-labelledby="gym-volume-chart">
            <div className={styles['chart-heading']}>
              <h3 id="gym-volume-chart">Volumen por semana</h3>
              <span>Carga × repeticiones</span>
            </div>
            <div className={styles.bars}>
              {analytics.weekly.map((point) => (
                <div
                  key={`volume-${point.key}`}
                  className={styles['bar-column']}
                  aria-label={`${point.label}: ${number(point.volumeLoad)} kilogramos por repetición`}
                >
                  <strong>{number(point.volumeLoad)}</strong>
                  <div className={styles['bar-track']} aria-hidden="true">
                    <span
                      className={styles['bar-fill']}
                      style={
                        {
                          '--bar-height': barHeight(point.volumeLoad, maxVolume),
                        } as BarStyle
                      }
                    />
                  </div>
                  <span>{point.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <p className={styles.note}>
          Las series sin peso o repeticiones permanecen registradas, pero no se suman al volumen.
        </p>
      </Card>

      <Card>
        <SectionHeader
          title="Récords confirmados"
          description="Solo máximos observados en Gym Sets; no se estima fuerza ni 1RM."
          domain="health"
        />
        <div className={styles['record-grid']}>
          <article>
            <span>Mayor carga</span>
            <strong>
              {heaviest?.bestLoad === null || !heaviest ? '—' : `${number(heaviest.bestLoad)} kg`}
            </strong>
            <small>
              {heaviest
                ? `${heaviest.exerciseName} · ${heaviest.bestLoadDate ?? 'sin fecha'}`
                : 'Sin cargas numéricas.'}
            </small>
          </article>
          <article>
            <span>Mejor volumen de sesión</span>
            <strong>
              {analytics.bestSessionVolume === null
                ? '—'
                : `${number(analytics.bestSessionVolume)} kg·rep`}
            </strong>
            <small>Mayor suma confirmada dentro de una sesión.</small>
          </article>
          <article>
            <span>Promedio por sesión</span>
            <strong>
              {analytics.averageSessionVolume === null
                ? '—'
                : `${number(analytics.averageSessionVolume)} kg·rep`}
            </strong>
            <small>Volumen total dividido por sesiones completas.</small>
          </article>
          <article>
            <span>Sesiones con estado</span>
            <strong>
              {analytics.completionRate === null ? '—' : `${analytics.completionRate}%`}
            </strong>
            <small>
              {analytics.completedSessions}/{analytics.trackedSessions} completas
            </small>
          </article>
        </div>
      </Card>

      {analytics.exerciseRecords.length > 0 ? (
        <Card>
          <SectionHeader
            title="Tendencia por ejercicio"
            description="Compara la carga máxima de las dos sesiones más recientes de cada ejercicio."
            domain="health"
          />
          <div className={styles['exercise-list']}>
            {analytics.exerciseRecords.slice(0, 10).map((exercise) => (
              <article key={exercise.key} className={styles.exercise}>
                <div>
                  <strong>{exercise.exerciseName}</strong>
                  <span>
                    {exercise.latestDate || 'Sin fecha'} · {exercise.completedSets} series
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Última carga</dt>
                    <dd>
                      {exercise.latestLoad === null ? '—' : `${number(exercise.latestLoad)} kg`}
                    </dd>
                  </div>
                  <div>
                    <dt>Variación</dt>
                    <dd>
                      {exercise.loadDelta === null
                        ? '—'
                        : `${exercise.loadDelta > 0 ? '+' : ''}${number(exercise.loadDelta)} kg`}
                    </dd>
                  </div>
                  <div>
                    <dt>Récord</dt>
                    <dd>{exercise.bestLoad === null ? '—' : `${number(exercise.bestLoad)} kg`}</dd>
                  </div>
                  <div>
                    <dt>Mejor set</dt>
                    <dd>
                      {exercise.bestSetVolume === null
                        ? '—'
                        : `${number(exercise.bestSetVolume)} kg·rep`}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
