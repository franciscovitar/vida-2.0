'use client';

import { useMemo, useState, useTransition } from 'react';

import { runWriteAction } from '@/app/actions/writes';
import { WritesDisabledNotice } from '@/components/actions/WritePanels';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { GymRoutine } from '@/types/gym';

import styles from './WritePanels.module.scss';

type DraftSet = {
  id: string;
  exerciseKey: string;
  exerciseName: string;
  setIndex: number;
  weight: string;
  reps: string;
  rir: string;
  rpe: string;
};

export function GymSessionPanel({
  writesEnabled,
  routine,
}: {
  writesEnabled: boolean;
  routine: GymRoutine | null;
}) {
  const days = useMemo(() => routine?.days ?? [], [routine]);
  const [dayKey, setDayKey] = useState(days[0]?.key ?? '');
  const activeDay = useMemo(
    () => days.find((day) => day.key === dayKey) ?? days[0] ?? null,
    [days, dayKey],
  );
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader title="Registrar sesión" />
        <WritesDisabledNotice />
      </Card>
    );
  }

  if (!routine || !activeDay) {
    return (
      <Card>
        <SectionHeader title="Registrar sesión" description="Sin rutina estructurada disponible." />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Registrar sesión"
        description="Notion define la rutina. Sheets guardará el resultado cuando esté configurado."
        domain="health"
      />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirm) {
            setMessage('Confirmá el registro.');
            return;
          }
          start(async () => {
            const result = await runWriteAction({
              actionType: 'gym.session.create',
              payload: {
                date: new Date().toISOString().slice(0, 10),
                routineKey: routine.name,
                workoutDayKey: activeDay.key,
                startedAt: null,
                finishedAt: null,
                durationMinutes: null,
                energyBefore: null,
                notes: null,
                sets: sets.map((set) => ({
                  exerciseKey: set.exerciseKey,
                  exerciseName: set.exerciseName,
                  setIndex: set.setIndex,
                  weight: set.weight === '' ? null : Number(set.weight),
                  reps: set.reps === '' ? null : Number(set.reps),
                  rir: set.rir === '' ? null : Number(set.rir),
                  rpe: set.rpe === '' ? null : Number(set.rpe),
                  completed: true,
                  notes: null,
                })),
              },
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (result.ok) {
              setSets([]);
              setConfirm(false);
            }
          });
        }}
      >
        <label className={styles.label}>
          Día
          <select
            className={styles.input}
            value={activeDay.key}
            onChange={(e) => {
              setDayKey(e.target.value);
              setSets([]);
            }}
          >
            {days.map((day) => (
              <option key={day.key} value={day.key}>
                {day.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          {activeDay.exercises.map((exercise) => (
            <Button
              key={exercise.key}
              type="button"
              size="sm"
              onClick={() => {
                setSets((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    exerciseKey: exercise.key,
                    exerciseName: exercise.name,
                    setIndex: prev.filter((item) => item.exerciseKey === exercise.key).length + 1,
                    weight: '',
                    reps: '',
                    rir: '',
                    rpe: '',
                  },
                ]);
              }}
            >
              + {exercise.name}
            </Button>
          ))}
        </div>

        <div className={styles.sets}>
          {sets.map((set) => (
            <div key={set.id} className={styles['set-row']}>
              <span>
                {set.exerciseName} #{set.setIndex}
              </span>
              <input
                className={styles.input}
                placeholder="kg"
                value={set.weight}
                onChange={(e) =>
                  setSets((prev) =>
                    prev.map((item) =>
                      item.id === set.id ? { ...item, weight: e.target.value } : item,
                    ),
                  )
                }
              />
              <input
                className={styles.input}
                placeholder="reps"
                value={set.reps}
                onChange={(e) =>
                  setSets((prev) =>
                    prev.map((item) =>
                      item.id === set.id ? { ...item, reps: e.target.value } : item,
                    ),
                  )
                }
              />
              <input
                className={styles.input}
                placeholder="RIR"
                value={set.rir}
                onChange={(e) =>
                  setSets((prev) =>
                    prev.map((item) =>
                      item.id === set.id ? { ...item, rir: e.target.value } : item,
                    ),
                  )
                }
              />
              <input
                className={styles.input}
                placeholder="RPE"
                value={set.rpe}
                onChange={(e) =>
                  setSets((prev) =>
                    prev.map((item) =>
                      item.id === set.id ? { ...item, rpe: e.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSets((prev) => prev.filter((item) => item.id !== set.id))}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>

        <p className={styles.message}>
          Resumen: {sets.length} set(s) · {activeDay.label} · {routine.name}
        </p>
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          Confirmo registrar esta sesión
        </label>
        <Button type="submit" variant="primary" disabled={pending || sets.length === 0}>
          {pending ? 'Guardando…' : 'Guardar sesión'}
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}
