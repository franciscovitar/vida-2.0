'use client';

import { Check, Clock3, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  buildGymSessionCreatePayload,
  createGymSessionDraft,
  deriveGymSessionDraftState,
  validateGymSessionDraft,
} from '@/lib/gym/session-model';
import type {
  GymRoutine,
  GymSessionDraft,
  GymSessionDraftExercise,
  GymSessionDraftSet,
} from '@/types/gym';

import styles from './GymSessionPanel.module.scss';

function argentinaDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function toLocalDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (number: number) => String(number).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  return Number(value.replace(',', '.'));
}

function inputNumber(value: number | null): string | number {
  return value ?? '';
}

function makeDraft(
  routine: GymRoutine,
  workoutDayKey: string,
  date: string,
): GymSessionDraft | null {
  const result = createGymSessionDraft({ routine, workoutDayKey, date });
  return result.ok ? result.draft : null;
}

function nextSet(exercise: GymSessionDraftExercise): GymSessionDraftSet {
  const setNumber = Math.max(0, ...exercise.sets.map((set) => set.setNumber)) + 1;

  return {
    key: `${exercise.exerciseKey}:set:${setNumber}:${crypto.randomUUID()}`,
    setNumber,
    targetReps: exercise.targetReps,
    targetRir: exercise.targetRir,
    targetRpe: exercise.targetRpe,
    weight: null,
    reps: null,
    rir: null,
    rpe: null,
    completed: false,
    note: null,
  };
}

export function GymSessionPanel({
  writesEnabled,
  routine,
}: {
  writesEnabled: boolean;
  routine: GymRoutine | null;
}) {
  const days = useMemo(() => routine?.days ?? [], [routine]);
  const initialDayKey = days[0]?.key ?? '';
  const initialDate = argentinaDate();

  const [dayKey, setDayKey] = useState(initialDayKey);
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState<GymSessionDraft | null>(() =>
    routine && initialDayKey ? makeDraft(routine, initialDayKey, initialDate) : null,
  );
  const [showValidation, setShowValidation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const validation = useMemo(() => (draft ? validateGymSessionDraft(draft) : null), [draft]);

  function replaceDraft(nextDayKey: string, nextDate: string) {
    if (!routine) return;
    setDayKey(nextDayKey);
    setDate(nextDate);
    setDraft(makeDraft(routine, nextDayKey, nextDate));
    setShowValidation(false);
    setMessage(null);
  }

  function updateDraft(transform: (current: GymSessionDraft) => GymSessionDraft) {
    setDraft((current) => {
      if (!current) return current;
      const next = transform(current);
      return { ...next, state: deriveGymSessionDraftState(next) };
    });
    setShowValidation(false);
    setMessage(null);
  }

  function updateSet(
    exerciseKey: string,
    setKey: string,
    transform: (current: GymSessionDraftSet) => GymSessionDraftSet,
  ) {
    updateDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.exerciseKey === exerciseKey
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => (set.key === setKey ? transform(set) : set)),
            }
          : exercise,
      ),
    }));
  }

  function addSet(exerciseKey: string) {
    updateDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.exerciseKey === exerciseKey
          ? { ...exercise, sets: [...exercise.sets, nextSet(exercise)] }
          : exercise,
      ),
    }));
  }

  function removeSet(exerciseKey: string, setKey: string) {
    updateDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.exerciseKey === exerciseKey
          ? { ...exercise, sets: exercise.sets.filter((set) => set.key !== setKey) }
          : exercise,
      ),
    }));
  }

  function resetDraft() {
    replaceDraft(dayKey, date);
  }

  if (!routine || days.length === 0 || !draft || !validation) {
    return (
      <Card>
        <SectionHeader
          title="Registrar sesión"
          description="La rutina todavía no tiene un día estructurado para iniciar un borrador."
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Registrar sesión"
        description="Completá el entrenamiento desde el celular. El borrador no modifica ninguna fuente."
        domain="health"
      />

      <p className={styles['safety-notice']} data-environment-writes={writesEnabled}>
        {writesEnabled
          ? 'Bloqueo de etapa activo: esta interfaz no envía datos aunque el entorno reporte escrituras.'
          : 'Modo borrador local: Sheets, Notion y Calendar permanecen sin cambios.'}
      </p>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          const result = buildGymSessionCreatePayload(draft);
          setShowValidation(true);
          setMessage(
            result.ok
              ? 'Borrador completo y listo para convertirse en propuesta. No se escribió ningún dato.'
              : 'Revisá los campos marcados antes de continuar.',
          );
        }}
      >
        <div className={styles['session-grid']}>
          <label className={styles.field}>
            <span>Fecha</span>
            <input
              className={styles.input}
              type="date"
              value={date}
              onChange={(event) => replaceDraft(dayKey, event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Día de rutina</span>
            <select
              className={styles.input}
              value={dayKey}
              onChange={(event) => replaceDraft(event.target.value, date)}
            >
              {days.map((day) => (
                <option key={day.key} value={day.key}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Inicio</span>
            <input
              className={styles.input}
              type="datetime-local"
              value={toLocalDateTimeInput(draft.startedAt)}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  startedAt: fromLocalDateTimeInput(event.target.value),
                }))
              }
            />
          </label>

          <label className={styles.field}>
            <span>Finalización</span>
            <input
              className={styles.input}
              type="datetime-local"
              value={toLocalDateTimeInput(draft.finishedAt)}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  finishedAt: fromLocalDateTimeInput(event.target.value),
                }))
              }
            />
          </label>

          <label className={styles.field}>
            <span>Duración manual (min)</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              max="720"
              inputMode="numeric"
              value={inputNumber(draft.durationMinutes)}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  durationMinutes: parseOptionalNumber(event.target.value),
                }))
              }
            />
          </label>
        </div>

        <div className={styles['time-actions']}>
          <Button
            type="button"
            iconLeft={Clock3}
            className={styles['touch-button']}
            onClick={() =>
              updateDraft((current) => ({
                ...current,
                startedAt: new Date().toISOString(),
                finishedAt: null,
              }))
            }
          >
            Empezar ahora
          </Button>
          <Button
            type="button"
            iconLeft={Check}
            className={styles['touch-button']}
            onClick={() =>
              updateDraft((current) => ({
                ...current,
                finishedAt: new Date().toISOString(),
              }))
            }
          >
            Finalizar ahora
          </Button>
        </div>

        <fieldset className={styles['energy-fieldset']}>
          <legend>Energía previa</legend>
          <div className={styles['energy-options']}>
            {[1, 2, 3, 4, 5].map((energy) => (
              <button
                key={energy}
                type="button"
                className={styles['energy-button']}
                data-active={draft.energyBefore === energy}
                aria-pressed={draft.energyBefore === energy}
                onClick={() =>
                  updateDraft((current) => ({
                    ...current,
                    energyBefore: energy as 1 | 2 | 3 | 4 | 5,
                  }))
                }
              >
                {energy}
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles['exercise-list']}>
          {draft.exercises.map((exercise) => (
            <article key={exercise.key} className={styles['exercise-card']}>
              <header className={styles['exercise-header']}>
                <div>
                  <span className={styles['exercise-order']}>Ejercicio {exercise.order}</span>
                  <h3>{exercise.exerciseName}</h3>
                </div>
                <div className={styles.prescription}>
                  {exercise.targetSets ? <span>{exercise.targetSets} series</span> : null}
                  {exercise.targetReps ? <span>{exercise.targetReps} reps</span> : null}
                  {exercise.targetRir ? <span>RIR {exercise.targetRir}</span> : null}
                  {exercise.targetRpe ? <span>RPE {exercise.targetRpe}</span> : null}
                </div>
              </header>

              {exercise.prescriptionNotes ? (
                <p className={styles['prescription-note']}>{exercise.prescriptionNotes}</p>
              ) : null}

              <div className={styles['set-list']}>
                {exercise.sets.length === 0 ? (
                  <p className={styles['empty-sets']}>
                    La rutina no define cuántas series hacer. Agregalas manualmente.
                  </p>
                ) : null}

                {exercise.sets.map((set) => (
                  <div key={set.key} className={styles['set-card']} data-completed={set.completed}>
                    <div className={styles['set-top']}>
                      <label className={styles['complete-toggle']}>
                        <input
                          type="checkbox"
                          checked={set.completed}
                          onChange={(event) =>
                            updateSet(exercise.exerciseKey, set.key, (current) => ({
                              ...current,
                              completed: event.target.checked,
                            }))
                          }
                        />
                        <span>Set {set.setNumber}</span>
                      </label>

                      <Button
                        type="button"
                        variant="ghost"
                        iconLeft={Trash2}
                        className={styles['remove-button']}
                        aria-label={`Quitar set ${set.setNumber} de ${exercise.exerciseName}`}
                        onClick={() => removeSet(exercise.exerciseKey, set.key)}
                      >
                        Quitar
                      </Button>
                    </div>

                    <div className={styles['set-fields']}>
                      <label className={styles['compact-field']}>
                        <span>kg</span>
                        <input
                          className={styles.input}
                          type="number"
                          min="0"
                          max="1000"
                          step="0.25"
                          inputMode="decimal"
                          value={inputNumber(set.weight)}
                          onChange={(event) =>
                            updateSet(exercise.exerciseKey, set.key, (current) => ({
                              ...current,
                              weight: parseOptionalNumber(event.target.value),
                            }))
                          }
                        />
                      </label>

                      <label className={styles['compact-field']}>
                        <span>Reps</span>
                        <input
                          className={styles.input}
                          type="number"
                          min="0"
                          max="500"
                          inputMode="numeric"
                          value={inputNumber(set.reps)}
                          onChange={(event) =>
                            updateSet(exercise.exerciseKey, set.key, (current) => ({
                              ...current,
                              reps: parseOptionalNumber(event.target.value),
                            }))
                          }
                        />
                      </label>

                      <label className={styles['compact-field']}>
                        <span>RIR</span>
                        <input
                          className={styles.input}
                          type="number"
                          min="0"
                          max="10"
                          step="0.5"
                          inputMode="decimal"
                          value={inputNumber(set.rir)}
                          onChange={(event) =>
                            updateSet(exercise.exerciseKey, set.key, (current) => ({
                              ...current,
                              rir: parseOptionalNumber(event.target.value),
                            }))
                          }
                        />
                      </label>

                      <label className={styles['compact-field']}>
                        <span>RPE</span>
                        <input
                          className={styles.input}
                          type="number"
                          min="1"
                          max="10"
                          step="0.5"
                          inputMode="decimal"
                          value={inputNumber(set.rpe)}
                          onChange={(event) =>
                            updateSet(exercise.exerciseKey, set.key, (current) => ({
                              ...current,
                              rpe: parseOptionalNumber(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label className={styles.field}>
                      <span>Nota del set</span>
                      <input
                        className={styles.input}
                        type="text"
                        maxLength={200}
                        value={set.note ?? ''}
                        onChange={(event) =>
                          updateSet(exercise.exerciseKey, set.key, (current) => ({
                            ...current,
                            note: event.target.value || null,
                          }))
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="secondary"
                iconLeft={Plus}
                className={styles['touch-button']}
                onClick={() => addSet(exercise.exerciseKey)}
              >
                Agregar set
              </Button>
            </article>
          ))}
        </div>

        <label className={styles.field}>
          <span>Notas de la sesión</span>
          <textarea
            className={styles.textarea}
            rows={3}
            maxLength={500}
            value={draft.note ?? ''}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                note: event.target.value || null,
              }))
            }
          />
        </label>

        <dl className={styles.metrics} aria-label="Resumen del borrador">
          <div>
            <dt>Sets</dt>
            <dd>
              {validation.metrics.completedSets}/{validation.metrics.plannedSets}
            </dd>
          </div>
          <div>
            <dt>Completado</dt>
            <dd>
              {validation.metrics.completionRate === null
                ? '—'
                : `${validation.metrics.completionRate}%`}
            </dd>
          </div>
          <div>
            <dt>Volumen</dt>
            <dd>{validation.metrics.volumeLoad || '—'}</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>
              {validation.metrics.durationMinutes === null
                ? '—'
                : `${validation.metrics.durationMinutes} min`}
            </dd>
          </div>
        </dl>

        {showValidation && validation.issues.length > 0 ? (
          <div className={styles.validation} role="alert">
            <strong>Falta revisar:</strong>
            <ul>
              {validation.issues.map((item, index) => (
                <li key={`${item.code}-${item.exerciseKey ?? 'session'}-${item.setKey ?? index}`}>
                  {item.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles['footer-actions']}>
          <Button
            type="button"
            variant="ghost"
            iconLeft={RotateCcw}
            className={styles['touch-button']}
            onClick={resetDraft}
          >
            Reiniciar borrador
          </Button>
          <Button type="submit" variant="primary" className={styles['touch-button']}>
            Validar borrador
          </Button>
        </div>

        {message ? (
          <p className={styles.message} role="status">
            {message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
