'use client';

import { useState } from 'react';

import type {
  GymExerciseResult,
  GymRoutine,
  GymRoutineSectionKind,
  GymSession,
  GymSessionSummary,
} from '@/types/gym';

import styles from './GymDashboard.module.scss';

const SECTION_LABELS: Record<GymRoutineSectionKind, string> = {
  mobility: 'Movilidad',
  recovery: 'Recuperación',
  cardio: 'Cardio',
  planning: 'Planificación',
  notes: 'Complemento',
};

type DayKind = 'torso-a' | 'torso-b' | 'pierna';

function dayKind(value: string | null | undefined): DayKind | null {
  if (!value) return null;
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[—–_]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (/torso[ -]*a/.test(normalized)) return 'torso-a';
  if (/torso[ -]*b/.test(normalized)) return 'torso-b';
  if (/pierna/.test(normalized)) return 'pierna';
  return null;
}

function normalizeExercise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(en|con|de|del|la|el)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparableExercise(
  exerciseName: string,
  sessionExercises: readonly GymExerciseResult[],
): GymExerciseResult | null {
  const target = normalizeExercise(exerciseName);
  if (target.length < 5) return null;

  const exact = sessionExercises.find((item) => normalizeExercise(item.exerciseName) === target);
  if (exact) return exact;

  const candidates = sessionExercises.filter((item) => {
    const observed = normalizeExercise(item.exerciseName);
    const shortest = Math.min(target.length, observed.length);
    return shortest >= 8 && (target.includes(observed) || observed.includes(target));
  });

  return candidates.length === 1 ? candidates[0]! : null;
}

function formatLoad(load: string): string {
  const normalized = load.trim().replace(',', '.');
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? `${normalized} kg` : load.trim();
}

function formatSet(load: string | null, reps: number | null): string {
  const cleanLoad = load?.trim() ?? '';
  if (cleanLoad && reps !== null) return `${formatLoad(cleanLoad)} × ${reps}`;
  if (cleanLoad) return formatLoad(cleanLoad);
  if (reps !== null) return `${reps} reps`;
  return '—';
}

function latestComparableSession(input: {
  dayLabel: string;
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
}): GymSession | null {
  const targetKind = dayKind(input.dayLabel);
  if (!targetKind) return null;

  const completed = new Set(
    input.summaries.filter((summary) => summary.completed === true).map((summary) => summary.key),
  );

  return (
    input.sessions
      .filter(
        (session) =>
          session.date <= input.today &&
          completed.has(session.key) &&
          dayKind(session.dayLabel) === targetKind,
      )
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

export function GymRoutineTabs({
  routine,
  sessions,
  summaries,
  today,
}: {
  routine: GymRoutine;
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
}) {
  const days = routine.days;
  const [active, setActive] = useState(0);
  const day = days[Math.min(active, Math.max(days.length - 1, 0))] ?? null;
  const previousSession = day
    ? latestComparableSession({ dayLabel: day.label, sessions, summaries, today })
    : null;

  return (
    <div className={styles.routine}>
      {days.length > 0 ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Días de rutina">
            {days.map((item, index) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={index === active}
                className={styles.tab}
                data-active={index === active ? 'true' : 'false'}
                onClick={() => setActive(index)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {day ? (
            <div className={styles.day} role="tabpanel">
              {previousSession ? (
                <div className={styles['previous-session']}>
                  <span>Última sesión comparable</span>
                  <strong>{previousSession.date}</strong>
                  <small>Se usa sólo como referencia para esta misma sesión de la rutina.</small>
                </div>
              ) : null}

              {day.notes.length > 0 ? (
                <ul className={styles.notes}>
                  {day.notes.map((note, index) => (
                    <li key={`${index}-${note}`}>{note}</li>
                  ))}
                </ul>
              ) : null}

              <ol className={styles.exercises}>
                {day.exercises.map((exercise) => {
                  const previousExercise = previousSession
                    ? comparableExercise(exercise.name, previousSession.exercises)
                    : null;

                  return (
                    <li key={exercise.key} className={styles.exercise}>
                      <div className={styles['exercise-top']}>
                        <span className={styles['exercise-name']}>{exercise.name}</span>
                        <span className={styles.order}>{exercise.order}</span>
                      </div>
                      <div className={styles.meta}>
                        {exercise.sets !== null ? <span>{exercise.sets} series</span> : null}
                        {exercise.reps ? <span>{exercise.reps}</span> : null}
                        {exercise.rest ? <span>Descanso {exercise.rest}</span> : null}
                        {exercise.targetRir ? <span>RIR {exercise.targetRir}</span> : null}
                        {exercise.targetRpe ? <span>RPE {exercise.targetRpe}</span> : null}
                      </div>
                      {previousExercise ? (
                        <div className={styles['previous-performance']}>
                          <span>Anterior</span>
                          <div>
                            {previousExercise.sets.map((set) => (
                              <small key={set.key}>{formatSet(set.load, set.reps)}</small>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {!exercise.sets && !exercise.reps ? (
                        <p className={styles.raw}>{exercise.rawText}</p>
                      ) : null}
                      {exercise.notes ? (
                        <p className={styles['exercise-note']}>{exercise.notes}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.body}>Sin días estructurados en la rutina.</p>
      )}

      {routine.supplementalSections.length > 0 ? (
        <div className={styles['supplemental-grid']}>
          {routine.supplementalSections.map((section) => (
            <section key={section.key} className={styles.supplemental}>
              <div className={styles['supplemental-heading']}>
                <span>{SECTION_LABELS[section.kind]}</span>
                <h3>{section.label}</h3>
              </div>
              {section.description ? <p className={styles.body}>{section.description}</p> : null}
              {section.items.length > 0 ? (
                <ol className={styles['supplemental-items']}>
                  {section.items.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ol>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
