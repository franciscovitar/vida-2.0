'use client';

import { useState } from 'react';

import type { GymRoutine } from '@/types/gym';

import styles from './GymDashboard.module.scss';

export function GymRoutineTabs({ routine }: { routine: GymRoutine }) {
  const days = routine.days;
  const [active, setActive] = useState(0);
  if (days.length === 0) {
    return <p className={styles.body}>Sin días estructurados en la rutina.</p>;
  }

  const day = days[Math.min(active, days.length - 1)]!;

  return (
    <div className={styles.routine}>
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

      <div className={styles.day} role="tabpanel">
        {day.notes.length > 0 ? (
          <ul className={styles.notes}>
            {day.notes.map((note) => (
              <li key={note}>{note}</li>
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
                {exercise.reps ? <span>{exercise.reps} reps</span> : null}
                {exercise.rest ? <span>Descanso {exercise.rest}</span> : null}
                {exercise.targetRir ? <span>RIR {exercise.targetRir}</span> : null}
                {exercise.targetRpe ? <span>RPE {exercise.targetRpe}</span> : null}
              </div>
              {!exercise.sets && !exercise.reps ? (
                <p className={styles.raw}>{exercise.rawText}</p>
              ) : null}
              {exercise.notes ? <p className={styles.body}>{exercise.notes}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
