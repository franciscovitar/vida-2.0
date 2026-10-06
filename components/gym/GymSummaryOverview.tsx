import Link from 'next/link';
import {
  Activity,
  Bike,
  CalendarDays,
  Dumbbell,
  LineChart,
  Sparkles,
  Target,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { computeGymV2Analytics } from '@/lib/gym/v2-analytics';
import type { GymSession, GymSessionSummary } from '@/types/gym';

import styles from './GymSummaryOverview.module.scss';

function shortDate(ymd: string | null): string {
  if (!ymd) return '—';
  const [, month, day] = ymd.split('-');
  return `${day}/${month}`;
}

export function GymSummaryOverview({
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
  const meaningfulInsights = analytics.insights
    .filter((insight) => insight.id !== 'weekly-frequency')
    .slice(0, 2);
  const statusTone =
    analytics.statusLabel === 'Progresando'
      ? 'positive'
      : analytics.statusLabel === 'Tendencia mixta'
        ? 'watch'
        : 'neutral';

  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-labelledby="gym-summary-title">
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Gimnasio · resumen</p>
          <h2 id="gym-summary-title">Tu semana de entrenamiento</h2>
          <p>
            Lo importante para orientarte rápido. La rutina, el análisis de progreso y el cardio
            quedan separados para no mezclar decisiones distintas.
          </p>
        </div>

        <div className={styles.status} data-tone={statusTone}>
          <Activity size={19} aria-hidden="true" />
          <span>
            <small>Estado reciente</small>
            <strong>{analytics.statusLabel}</strong>
            <span>{analytics.statusDetail}</span>
          </span>
        </div>

        <div className={styles.metrics}>
          <article>
            <Target size={17} aria-hidden="true" />
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

          <article>
            <CalendarDays size={17} aria-hidden="true" />
            <div>
              <span>Última sesión</span>
              <strong>{analytics.latestSessionLabel ?? 'Sin sesión reciente'}</strong>
              <small>{shortDate(analytics.latestSessionDate)}</small>
            </div>
          </article>

          <article>
            <LineChart size={17} aria-hidden="true" />
            <div>
              <span>Comparaciones útiles</span>
              <strong className="tabular">{analytics.comparableExercises}</strong>
              <small>ejercicios con al menos dos registros comparables</small>
            </div>
          </article>
        </div>
      </section>

      <div className={styles.actions} aria-label="Accesos rápidos de Gimnasio">
        <Link href="/gimnasio/rutina">
          <span className={styles.icon}>
            <Dumbbell size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>Rutina</strong>
            <small>Qué hacer y cómo está prescripto.</small>
          </span>
        </Link>
        <Link href="/gimnasio/progreso">
          <span className={styles.icon}>
            <LineChart size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>Progreso</strong>
            <small>Ejercicios, tendencias e historial.</small>
          </span>
        </Link>
        <Link href="/gimnasio/cardio">
          <span className={styles.icon}>
            <Bike size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>Cardio</strong>
            <small>Pasos, bici y fútbol contra tu plan.</small>
          </span>
        </Link>
      </div>

      <Card aria-labelledby="gym-summary-changes">
        <SectionHeader
          id="gym-summary-changes"
          title="Qué cambió"
          description="Sólo señales de rendimiento que aportan algo distinto al resumen semanal."
          domain="health"
        />
        {meaningfulInsights.length > 0 ? (
          <div className={styles.insights}>
            {meaningfulInsights.map((insight) => (
              <article key={insight.id} data-tone={insight.tone}>
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
        ) : (
          <p className={styles.empty}>
            Todavía no hay un cambio comparable suficientemente claro para destacar.
          </p>
        )}
      </Card>
    </div>
  );
}
