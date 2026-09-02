import { CalendarRange } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { buildGymPreviousWeekSnapshot } from '@/lib/gym/previous-week';
import type { GymSessionSummary, GymSession } from '@/types/gym';

import styles from './GymPreviousWeek.module.scss';

function shortDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatLoad(load: string): string {
  const normalized = load.trim().replace(',', '.');
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? `${normalized} kg` : load;
}

function formatSet(load: string | null, reps: number | null): string {
  if (load && reps !== null) return `${formatLoad(load)} × ${reps}`;
  if (load) return formatLoad(load);
  if (reps !== null) return `${reps} reps`;
  return '—';
}

export function GymPreviousWeek({
  sessions,
  summaries,
  today,
}: {
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
}) {
  const snapshot = buildGymPreviousWeekSnapshot({ sessions, summaries, today });
  const hasInference = snapshot.sessions.some((entry) => entry.labelInferred);

  return (
    <Card className={styles.card} aria-labelledby="gym-previous-week-title">
      <SectionHeader
        id="gym-previous-week-title"
        title="Semana anterior"
        description="Tus marcas de la última semana completa para intentar superarlas. Se actualiza automáticamente cada lunes."
        icon={CalendarRange}
        domain="health"
        action={
          <span className={styles.range}>
            {shortDate(snapshot.startDate)}–{shortDate(snapshot.endDate)}
          </span>
        }
      />

      {snapshot.sessions.length === 0 ? (
        <p className={styles.empty}>No hay entrenos completos registrados en la semana anterior.</p>
      ) : (
        <div className={styles.weekGrid}>
          {snapshot.sessions.map(({ session, displayLabel, labelInferred }) => (
            <article key={session.key} className={styles.session}>
              <header className={styles.sessionHeader}>
                <div>
                  <span>Entreno previo</span>
                  <h3>
                    {displayLabel}
                    {labelInferred ? <sup>*</sup> : null}
                  </h3>
                </div>
                <time dateTime={session.date}>{shortDate(session.date)}</time>
              </header>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Ejercicio</th>
                      <th scope="col">Peso × reps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.exercises.map((exercise) => (
                      <tr key={exercise.key}>
                        <th scope="row">{exercise.exerciseName}</th>
                        <td>
                          <div className={styles.sets}>
                            {exercise.sets.map((set) => (
                              <span key={set.key}>{formatSet(set.load, set.reps)}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}

      {hasInference ? (
        <p className={styles.footnote}>
          * Día inferido por una coincidencia fuerte de ejercicios; el registro original no tenía
          etiqueta de rutina.
        </p>
      ) : null}
    </Card>
  );
}
