'use client';

import { useState } from 'react';

import type { GymRoutine, GymRoutineSectionKind } from '@/types/gym';

import styles from './GymDashboard.module.scss';

const SECTION_LABELS: Record<GymRoutineSectionKind, string> = {
  mobility: 'Movilidad',
  recovery: 'Recuperación',
  cardio: 'Cardio',
  planning: 'Planificación',
  notes: 'Complemento',
};

export function GymRoutineTabs({ routine }: { routine: GymRoutine }) {
  const days = routine.days;
  const [active, setActive] = useState(0);
  const day = days[Math.min(active, Math.max(days.length - 1, 0))] ?? null;

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
              {day.notes.length > 0 ? (
                <ul className={styles.notes}>
                  {day.notes.map((note, index) => (
                    <li key={`${index}-${note}`}>{note}</li>
                  ))}
                </ul>
              ) : null}

              <ol className={styles.exercises}>
                {day.exercises.map((exercise) => (
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
                    {!exercise.sets && !exercise.reps ? (
                      <p className={styles.raw}>{exercise.rawText}</p>
                    ) : null}
                    {exercise.notes ? (
                      <p className={styles['exercise-note']}>{exercise.notes}</p>
                    ) : null}
                  </li>
                ))}
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
